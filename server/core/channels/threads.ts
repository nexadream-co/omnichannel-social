import { threads as caps } from '../../../shared/channels/threads'
import { env } from '../env'
import { ChannelError, type ChannelAdapter, type ResolvedTarget } from './adapter'
import { classifyGraphError, graphRequest } from './graph-client'

const SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_read_replies', 'threads_manage_insights']
const VERSION = 'v1.0'
const graph = `https://graph.threads.net/${VERSION}`

interface ThreadItem { id: string, text?: string, timestamp: string, permalink?: string }

export const threadsAdapter: ChannelAdapter = {
  caps,
  apiVersion: VERSION,
  isConfigured: () => Boolean(env().THREADS_APP_ID && env().THREADS_APP_SECRET),

  oauth: {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({ client_id: env().THREADS_APP_ID, redirect_uri: redirectUri, scope: SCOPES.join(','), response_type: 'code', state })
      return `https://threads.net/oauth/authorize?${params}`
    },
    async exchange(code, redirectUri, fetchImpl) {
      const config = env()
      const short = await graphRequest<{ access_token: string, user_id: string | number }>({
        fetch: fetchImpl, url: 'https://graph.threads.net/oauth/access_token', method: 'POST',
        params: { client_id: config.THREADS_APP_ID, client_secret: config.THREADS_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code }
      })
      const long = await graphRequest<{ access_token: string, expires_in: number }>({
        fetch: fetchImpl, url: 'https://graph.threads.net/access_token',
        params: { grant_type: 'th_exchange_token', client_secret: config.THREADS_APP_SECRET, access_token: short.access_token }
      })
      const me = await graphRequest<{ id: string, username: string, threads_profile_picture_url?: string }>({
        fetch: fetchImpl, url: `${graph}/me`, params: { fields: 'id,username,threads_profile_picture_url' }, accessToken: long.access_token
      })
      return [{
        externalId: me.id,
        username: me.username,
        avatarUrl: me.threads_profile_picture_url ?? null,
        accessToken: long.access_token,
        refreshToken: null,
        tokenExpiresAt: new Date(Date.now() + long.expires_in * 1000),
        scopes: SCOPES,
        meta: { userId: String(short.user_id) }
      }]
    },
    async refresh(token, fetchImpl) {
      const result = await graphRequest<{ access_token: string, expires_in: number }>({
        fetch: fetchImpl, url: 'https://graph.threads.net/refresh_access_token', params: { grant_type: 'th_refresh_token', access_token: token.accessToken }
      })
      return { accessToken: result.access_token, refreshToken: null, tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000) }
    }
  },

  async getQuota(c) {
    const result = await graphRequest<{ data: { quota_usage: number, config?: { quota_total: number } }[] }>({
      fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads_publishing_limit`, params: { fields: 'quota_usage,config' }, accessToken: c.account.accessToken
    })
    const row = result.data[0]
    return { used: row?.quota_usage ?? 0, limit: row?.config?.quota_total ?? caps.dailyPublishLimit ?? 250 }
  },

  async prepare(c, t: ResolvedTarget) {
    const create = (params: Record<string, string | boolean | undefined>) => graphRequest<{ id: string }>({
      fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads`, method: 'POST', params, accessToken: c.account.accessToken
    })
    const media = (item: { url: string, kind: 'image' | 'video' }) => item.kind === 'image' ? { media_type: 'IMAGE', image_url: item.url } : { media_type: 'VIDEO', video_url: item.url }
    if (t.format === 'text') {
      return { containerIds: [(await create({ media_type: 'TEXT', text: t.caption, link_attachment: t.options.linkAttachment })).id] }
    }
    if (t.format === 'carousel') {
      const children: string[] = []
      for (const item of t.media) children.push((await create({ ...media(item), is_carousel_item: true })).id)
      return { containerIds: children }
    }
    const item = t.media[0]
    if (!item) throw new ChannelError({ kind: 'validation', code: 'NO_MEDIA', message: 'Media post without media' })
    return { containerIds: [(await create({ ...media(item), text: t.caption, alt_text: t.options.altText })).id] }
  },

  async checkStatus(c, containerIds) {
    for (const id of containerIds) {
      const result = await graphRequest<{ status: string, error_message?: string }>({ fetch: c.fetch, url: `${graph}/${id}`, params: { fields: 'status,error_message' }, accessToken: c.account.accessToken })
      if (result.status === 'ERROR' || result.status === 'EXPIRED') {
        return { kind: result.status === 'EXPIRED' ? 'transient' : 'validation', code: `CONTAINER_${result.status}`, message: result.error_message ?? `Container ${id} is ${result.status}` }
      }
      if (result.status !== 'FINISHED' && result.status !== 'PUBLISHED') return 'pending'
    }
    return 'ready'
  },

  async publish(c, t, containerIds) {
    let creationId = containerIds[0]!
    if (t.format === 'carousel') {
      creationId = (await graphRequest<{ id: string }>({
        fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads`, method: 'POST',
        params: { media_type: 'CAROUSEL', children: containerIds.join(','), text: t.caption }, accessToken: c.account.accessToken
      })).id
    }
    const published = await graphRequest<{ id: string }>({
      fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads_publish`, method: 'POST', params: { creation_id: creationId }, accessToken: c.account.accessToken, timeoutMs: 60_000
    })
    const detail = await graphRequest<{ permalink?: string }>({ fetch: c.fetch, url: `${graph}/${published.id}`, params: { fields: 'permalink' }, accessToken: c.account.accessToken })
      .catch(() => ({ permalink: undefined }))
    if (t.options.firstComment) {
      await graphRequest<{ id: string }>({
        fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads`, method: 'POST',
        params: { media_type: 'TEXT', text: t.options.firstComment, reply_to_id: published.id, auto_publish_text: true }, accessToken: c.account.accessToken
      }).catch(error => c.log.warn('threads.first_reply_failed', { error }))
    }
    return { externalId: published.id, permalink: detail.permalink }
  },

  async findRecent(c, since) {
    const result = await graphRequest<{ data: ThreadItem[] }>({
      fetch: c.fetch, url: `${graph}/${c.account.externalId}/threads`, params: { fields: 'id,text,timestamp,permalink', limit: 25 }, accessToken: c.account.accessToken
    })
    return result.data.filter(m => new Date(m.timestamp) >= since).map(m => ({ externalId: m.id, caption: m.text ?? '', ts: new Date(m.timestamp), permalink: m.permalink }))
  },

  async fetchInsights(c, externalIds) {
    const rows = []
    for (const id of externalIds) {
      const result = await graphRequest<{ data: { name: string, values?: { value: number }[], total_value?: { value: number } }[] }>({
        fetch: c.fetch, url: `${graph}/${id}/insights`, params: { metric: 'views,likes,replies,reposts,quotes,shares' }, accessToken: c.account.accessToken
      })
      rows.push({ externalId: id, metrics: Object.fromEntries(result.data.map(m => [m.name, m.total_value?.value ?? m.values?.[0]?.value ?? 0])) })
    }
    return rows
  },

  normalizeError(e) {
    return e instanceof ChannelError ? e.detail : classifyGraphError(e)
  }
}
