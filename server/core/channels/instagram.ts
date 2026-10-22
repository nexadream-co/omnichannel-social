import { instagram as caps } from '../../../shared/channels/instagram'
import { env } from '../env'
import { ChannelError, type AdapterCtx, type ChannelAdapter, type ConnectedAccount, type ResolvedTarget } from './adapter'
import { classifyGraphError, graphRequest, optionalMetrics, postStatesPerPost } from './graph-client'

const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments', 'instagram_business_manage_messages']
const graph = () => `https://graph.instagram.com/${env().META_GRAPH_VERSION}`

interface MediaItem { id: string, caption?: string, timestamp: string, permalink?: string }

function mediaParams(item: { url: string, kind: 'image' | 'video' }) {
  return item.kind === 'image' ? { image_url: item.url } : { media_type: 'VIDEO', video_url: item.url }
}

/** Instagram API with Instagram Login: no Facebook Page needed (docs/PLATFORM-CONSTRAINTS.md). */
export const instagramAdapter: ChannelAdapter = {
  caps,
  get apiVersion() {
    return env().META_GRAPH_VERSION
  },
  isConfigured: () => Boolean(env().INSTAGRAM_APP_ID && env().INSTAGRAM_APP_SECRET),

  oauth: {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({ client_id: env().INSTAGRAM_APP_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(','), state })
      return `https://www.instagram.com/oauth/authorize?${params}`
    },
    async exchange(code, redirectUri, fetchImpl) {
      const config = env()
      const short = await graphRequest<{ access_token: string, user_id: string | number, permissions?: string[] }>({
        fetch: fetchImpl, url: 'https://api.instagram.com/oauth/access_token', method: 'POST',
        params: { client_id: config.INSTAGRAM_APP_ID, client_secret: config.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code }
      })
      const long = await graphRequest<{ access_token: string, expires_in: number }>({
        fetch: fetchImpl, url: 'https://graph.instagram.com/access_token',
        params: { grant_type: 'ig_exchange_token', client_secret: config.INSTAGRAM_APP_SECRET, access_token: short.access_token }
      })
      const me = await graphRequest<{ user_id: string, username: string, profile_picture_url?: string, account_type?: string }>({
        fetch: fetchImpl, url: `${graph()}/me`, params: { fields: 'user_id,username,profile_picture_url,account_type' }, accessToken: long.access_token
      })
      if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR'].includes(me.account_type)) {
        throw new ChannelError({ kind: 'validation', code: 'PERSONAL_ACCOUNT', message: 'Instagram personal accounts cannot publish through the API' })
      }
      const account: ConnectedAccount = {
        externalId: String(me.user_id),
        username: me.username,
        avatarUrl: me.profile_picture_url ?? null,
        accessToken: long.access_token,
        refreshToken: null,
        tokenExpiresAt: new Date(Date.now() + long.expires_in * 1000),
        scopes: short.permissions ?? SCOPES,
        meta: { userId: String(short.user_id), accountType: me.account_type ?? null }
      }
      return [account]
    },
    async refresh(token, fetchImpl) {
      const result = await graphRequest<{ access_token: string, expires_in: number }>({
        fetch: fetchImpl, url: 'https://graph.instagram.com/refresh_access_token', params: { grant_type: 'ig_refresh_token', access_token: token.accessToken }
      })
      return { accessToken: result.access_token, refreshToken: null, tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000) }
    }
  },

  async getQuota(c) {
    const result = await graphRequest<{ data: { quota_usage: number, config?: { quota_total: number } }[] }>({
      fetch: c.fetch, url: `${graph()}/${c.account.externalId}/content_publishing_limit`, params: { fields: 'quota_usage,config' }, accessToken: c.account.accessToken
    })
    const row = result.data[0]
    return { used: row?.quota_usage ?? 0, limit: row?.config?.quota_total ?? caps.dailyPublishLimit ?? 50 }
  },

  /** Creates the container(s). Carousel children are created here; the parent is created right before media_publish. */
  async prepare(c, t: ResolvedTarget) {
    const create = (params: Record<string, string | boolean | undefined>) => graphRequest<{ id: string }>({
      fetch: c.fetch, url: `${graph()}/${c.account.externalId}/media`, method: 'POST', params, accessToken: c.account.accessToken
    })
    if (t.format === 'carousel') {
      const children: string[] = []
      for (const item of t.media) children.push((await create({ ...mediaParams(item), is_carousel_item: true })).id)
      return { containerIds: children }
    }
    const item = t.media[0]
    if (!item) throw new ChannelError({ kind: 'validation', code: 'NO_MEDIA', message: 'Instagram posts need media' })
    if (t.format === 'reel') return { containerIds: [(await create({ media_type: 'REELS', video_url: item.url, caption: t.caption, share_to_feed: true, ...(item.coverMs ? { thumb_offset: String(item.coverMs) } : {}) })).id] }
    if (t.format === 'story') return { containerIds: [(await create({ media_type: 'STORIES', ...(item.kind === 'image' ? { image_url: item.url } : { video_url: item.url }) })).id] }
    return { containerIds: [(await create({ image_url: item.url, caption: t.caption, alt_text: t.options.altText })).id] }
  },

  async checkStatus(c, containerIds) {
    for (const id of containerIds) {
      const result = await graphRequest<{ status_code: string }>({ fetch: c.fetch, url: `${graph()}/${id}`, params: { fields: 'status_code' }, accessToken: c.account.accessToken })
      if (result.status_code === 'ERROR' || result.status_code === 'EXPIRED') {
        return { kind: result.status_code === 'EXPIRED' ? 'transient' : 'validation', code: `CONTAINER_${result.status_code}`, message: `Container ${id} is ${result.status_code}` }
      }
      if (result.status_code !== 'FINISHED' && result.status_code !== 'PUBLISHED') return 'pending'
    }
    return 'ready'
  },

  async publish(c, t, containerIds) {
    let creationId = containerIds[0]!
    if (t.format === 'carousel') {
      const parent = await graphRequest<{ id: string }>({
        fetch: c.fetch, url: `${graph()}/${c.account.externalId}/media`, method: 'POST',
        params: { media_type: 'CAROUSEL', children: containerIds.join(','), caption: t.caption }, accessToken: c.account.accessToken
      })
      creationId = parent.id
    }
    const published = await graphRequest<{ id: string }>({
      fetch: c.fetch, url: `${graph()}/${c.account.externalId}/media_publish`, method: 'POST', params: { creation_id: creationId }, accessToken: c.account.accessToken, timeoutMs: 60_000
    })
    const detail = await graphRequest<{ permalink?: string }>({ fetch: c.fetch, url: `${graph()}/${published.id}`, params: { fields: 'permalink' }, accessToken: c.account.accessToken })
      .catch(() => ({ permalink: undefined }))
    if (t.options.firstComment) {
      await graphRequest({ fetch: c.fetch, url: `${graph()}/${published.id}/comments`, method: 'POST', params: { message: t.options.firstComment }, accessToken: c.account.accessToken })
        .catch(error => c.log.warn('instagram.first_comment_failed', { error }))
    }
    return { externalId: published.id, permalink: detail.permalink }
  },

  async findRecent(c, since) {
    const result = await graphRequest<{ data: MediaItem[] }>({
      fetch: c.fetch, url: `${graph()}/${c.account.externalId}/media`, params: { fields: 'id,caption,timestamp,permalink', limit: 25 }, accessToken: c.account.accessToken
    })
    return result.data.filter(m => new Date(m.timestamp) >= since).map(m => ({ externalId: m.id, caption: m.caption ?? '', ts: new Date(m.timestamp), permalink: m.permalink }))
  },

  async fetchPostStates(c, externalIds) {
    return postStatesPerPost(externalIds, async (id) => {
      // A missing `caption` field means the post has no caption (Graph omits empty fields).
      const node = await graphRequest<{ caption?: string, permalink?: string }>({
        fetch: c.fetch, url: `${graph()}/${id}`, params: { fields: 'caption,permalink' }, accessToken: c.account.accessToken
      })
      const metrics = await optionalMetrics(async () => {
        const result = await graphRequest<{ data: { name: string, values?: { value: number }[], total_value?: { value: number } }[] }>({
          fetch: c.fetch, url: `${graph()}/${id}/insights`, params: { metric: 'views,reach,likes,comments,shares,saved' }, accessToken: c.account.accessToken
        })
        return Object.fromEntries(result.data.map(m => [m.name, m.total_value?.value ?? m.values?.[0]?.value ?? 0]))
      })
      return { caption: node.caption ?? '', permalink: node.permalink ?? null, metrics }
    })
  },

  /** Comment-to-DM: one private reply per comment, within 7 days (PLATFORM-CONSTRAINTS). */
  async sendPrivateReply(c: AdapterCtx, commentId, text) {
    await graphRequest({
      fetch: c.fetch, url: `${graph()}/${c.account.externalId}/messages`, method: 'POST',
      params: { recipient: JSON.stringify({ comment_id: commentId }), message: JSON.stringify({ text }) }, accessToken: c.account.accessToken
    })
  },

  async replyToComment(c, commentId, text) {
    await graphRequest({ fetch: c.fetch, url: `${graph()}/${commentId}/replies`, method: 'POST', params: { message: text }, accessToken: c.account.accessToken })
  },

  normalizeError(e) {
    return e instanceof ChannelError ? e.detail : classifyGraphError(e)
  }
}
