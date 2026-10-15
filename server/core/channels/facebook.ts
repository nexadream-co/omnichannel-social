import { facebook as caps } from '../../../shared/channels/facebook'
import { env } from '../env'
import { ChannelError, type AdapterCtx, type ChannelAdapter, type ResolvedTarget } from './adapter'
import { classifyGraphError, graphRequest } from './graph-client'

const SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']
const graph = () => `https://graph.facebook.com/${env().META_GRAPH_VERSION}`

/** Every call carries appsecret_proof (docs/PLATFORM-CONSTRAINTS.md). */
function call<T>(c: AdapterCtx, path: string, method: 'GET' | 'POST', params: Record<string, string | number | boolean | undefined> = {}, timeoutMs?: number) {
  return graphRequest<T>({ fetch: c.fetch, url: `${graph()}/${path}`, method, params, accessToken: c.account.accessToken, appSecret: env().META_APP_SECRET, timeoutMs })
}

interface PostItem { id: string, message?: string, created_time: string, permalink_url?: string }

/** Facebook Login for Business → Page tokens. Page tokens from a long-lived user token don't expire. */
export const facebookAdapter: ChannelAdapter = {
  caps,
  get apiVersion() {
    return env().META_GRAPH_VERSION
  },
  isConfigured: () => Boolean(env().META_APP_ID && env().META_APP_SECRET),

  oauth: {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({ client_id: env().META_APP_ID, redirect_uri: redirectUri, state, scope: SCOPES.join(','), response_type: 'code' })
      return `https://www.facebook.com/${env().META_GRAPH_VERSION}/dialog/oauth?${params}`
    },
    async exchange(code, redirectUri, fetchImpl) {
      const config = env()
      const short = await graphRequest<{ access_token: string }>({
        fetch: fetchImpl, url: `${graph()}/oauth/access_token`,
        params: { client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET, redirect_uri: redirectUri, code }
      })
      const long = await graphRequest<{ access_token: string }>({
        fetch: fetchImpl, url: `${graph()}/oauth/access_token`,
        params: { grant_type: 'fb_exchange_token', client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET, fb_exchange_token: short.access_token }
      })
      const me = await graphRequest<{ id: string }>({ fetch: fetchImpl, url: `${graph()}/me`, params: { fields: 'id' }, accessToken: long.access_token, appSecret: config.META_APP_SECRET })
      const pages = await graphRequest<{ data: { id: string, name: string, access_token: string, tasks?: string[], picture?: { data?: { url?: string } } }[] }>({
        fetch: fetchImpl, url: `${graph()}/me/accounts`, params: { fields: 'id,name,access_token,tasks,picture{url}', limit: 100 }, accessToken: long.access_token, appSecret: config.META_APP_SECRET
      })
      // Only Pages where this person can create content are useful.
      return pages.data.filter(page => !page.tasks || page.tasks.includes('CREATE_CONTENT')).map(page => ({
        externalId: page.id,
        username: page.name,
        avatarUrl: page.picture?.data?.url ?? null,
        accessToken: page.access_token,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: SCOPES,
        meta: { userId: me.id, pageName: page.name }
      }))
    }
  },

  async prepare() {
    return { ready: true }
  },

  async checkStatus() {
    return 'ready'
  },

  async publish(c, t: ResolvedTarget) {
    const page = c.account.externalId
    let externalId: string
    if (t.format === 'text') {
      externalId = (await call<{ id: string }>(c, `${page}/feed`, 'POST', { message: t.caption, link: t.options.linkAttachment })).id
    } else if (t.format === 'feed') {
      const photo = await call<{ id: string, post_id?: string }>(c, `${page}/photos`, 'POST', { url: t.media[0]!.url, message: t.caption, alt_text_custom: t.options.altText })
      externalId = photo.post_id ?? photo.id
    } else if (t.format === 'carousel') {
      const ids: string[] = []
      for (const item of t.media) ids.push((await call<{ id: string }>(c, `${page}/photos`, 'POST', { url: item.url, published: false })).id)
      externalId = (await call<{ id: string }>(c, `${page}/feed`, 'POST', { message: t.caption, attached_media: JSON.stringify(ids.map(id => ({ media_fbid: id }))) })).id
    } else if (t.format === 'reel') {
      const start = await call<{ video_id: string, upload_url: string }>(c, `${page}/video_reels`, 'POST', { upload_phase: 'start' })
      const upload = await c.fetch(start.upload_url, { method: 'POST', headers: { Authorization: `OAuth ${c.account.accessToken}`, file_url: t.media[0]!.url }, signal: AbortSignal.timeout(60_000) })
      if (!upload.ok) throw new ChannelError({ kind: 'transient', code: 'REEL_UPLOAD', message: `Reel upload failed (${upload.status})` })
      await call(c, `${page}/video_reels`, 'POST', { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: t.caption }, 60_000)
      externalId = start.video_id
    } else {
      throw new ChannelError({ kind: 'validation', code: 'FORMAT', message: `Facebook does not support ${t.format}` })
    }
    const detail = await call<{ permalink_url?: string }>(c, externalId, 'GET', { fields: 'permalink_url' }).catch(() => ({ permalink_url: undefined }))
    if (t.options.firstComment) {
      await call(c, `${externalId}/comments`, 'POST', { message: t.options.firstComment }).catch(error => c.log.warn('facebook.first_comment_failed', { error }))
    }
    return { externalId, permalink: detail.permalink_url }
  },

  async findRecent(c, since) {
    const result = await call<{ data: PostItem[] }>(c, `${c.account.externalId}/posts`, 'GET', { fields: 'id,message,created_time,permalink_url', limit: 25, since: Math.floor(since.getTime() / 1000) })
    return result.data.map(p => ({ externalId: p.id, caption: p.message ?? '', ts: new Date(p.created_time), permalink: p.permalink_url }))
  },

  normalizeError(e) {
    return e instanceof ChannelError ? e.detail : classifyGraphError(e)
  }
}
