import { randomBytes } from 'node:crypto'
import { CHANNELS } from '../../../shared/channels/registry'
import type { Platform } from '../../../shared/channels/types'
import { env } from '../env'
import { ChannelError, type AdapterError, type ChannelAdapter, type ConnectedAccount } from './adapter'

/**
 * In-memory adapter for local development and tests (ADAPTER_MODE=fake). OAuth skips Meta entirely:
 * the "authorize" URL is our own callback. A caption containing [fail:<kind>] forces that error kind
 * at publish time, and [fail:unknown] simulates a media_publish whose result never came back.
 */
const published = new Map<string, { externalId: string, caption: string, ts: Date, permalink: string }[]>()
const containers = new Map<string, number>() // container id → status polls remaining
/** Messages the fake adapter "sent" (private replies and public comment replies), for tests and local QA. */
export const fakeOutbox: { kind: 'dm' | 'reply', accountId: string, commentId: string, text: string }[] = []
/** Post ids the fake platform reports as deleted, and captions edited there (a creator changed them in the app), for tests. */
export const fakeRemovedPosts = new Set<string>()
export const fakeEditedCaptions = new Map<string, string>()

const FAKE_ACCOUNTS: Record<Platform, () => ConnectedAccount[]> = {
  instagram: () => [account('17841400000000001', 'kreator.demo')],
  threads: () => [account('27000000000000001', 'kreator.demo')],
  facebook: () => [account('100000000000001', 'Toko Kreator Demo'), account('100000000000002', 'Kreator Demo Official')],
  tiktok: () => [],
  youtube: () => [],
  x: () => []
}

function account(externalId: string, username: string): ConnectedAccount {
  return {
    externalId, username, avatarUrl: null,
    accessToken: `fake-token-${randomBytes(6).toString('hex')}`, refreshToken: null,
    tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000), scopes: ['fake'], meta: { userId: `user-${externalId}`, fake: true }
  }
}

function forcedFailure(caption: string): AdapterError['kind'] | 'unknown' | null {
  const match = /\[fail:(auth|rate_limit|quota|validation|transient|permanent|unknown)\]/.exec(caption)
  return (match?.[1] as AdapterError['kind'] | 'unknown' | undefined) ?? null
}

export function fakeAdapter(platform: Platform): ChannelAdapter {
  return {
    caps: CHANNELS[platform],
    apiVersion: 'fake',
    isConfigured: () => true,
    oauth: {
      authorizeUrl: (state, redirectUri) => `${redirectUri}?code=fake-${platform}&state=${encodeURIComponent(state)}`,
      async exchange(code) {
        if (code === 'fake-denied') throw new ChannelError({ kind: 'auth', code: 'DENIED', message: 'User denied' })
        return FAKE_ACCOUNTS[platform]()
      },
      async refresh(token) {
        return { ...token, tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000) }
      }
    },
    async getQuota(c) {
      const since = Date.now() - 86_400_000
      return { used: (published.get(c.account.externalId) ?? []).filter(p => p.ts.getTime() > since).length, limit: CHANNELS[platform].dailyPublishLimit ?? 50 }
    },
    async prepare(_c, t) {
      if (forcedFailure(t.caption) === 'validation') throw new ChannelError({ kind: 'validation', code: 'FAKE', message: 'Forced validation error' })
      if (!CHANNELS[platform].asyncContainer) return { ready: true }
      const ids = (t.format === 'carousel' ? t.media : [t.media[0] ?? null]).map(() => `fake-container-${randomBytes(4).toString('hex')}`)
      for (const id of ids) containers.set(id, t.media.some(m => m.kind === 'video') ? 2 : 0)
      return { containerIds: ids }
    },
    async checkStatus(_c, ids) {
      for (const id of ids) {
        const remaining = containers.get(id) ?? 0
        if (remaining > 0) {
          containers.set(id, remaining - 1)
          return 'pending'
        }
      }
      return 'ready'
    },
    async publish(c, t) {
      const failure = forcedFailure(t.caption)
      const externalId = `fake-post-${randomBytes(5).toString('hex')}`
      if (failure === 'unknown') {
        // The post DID go out, but the response is lost: reconciliation must find it, never re-publish.
        published.set(c.account.externalId, [...(published.get(c.account.externalId) ?? []), { externalId, caption: t.caption, ts: new Date(), permalink: `https://example.test/${externalId}` }])
        throw new ChannelError({ kind: 'transient', code: 'TIMEOUT', message: 'Timed out waiting for media_publish' })
      }
      if (failure && failure !== 'validation') throw new ChannelError({ kind: failure, code: 'FAKE', message: `Forced ${failure} error`, retryAfter: failure === 'quota' || failure === 'rate_limit' ? new Date(Date.now() + 3_600_000) : undefined })
      const record = { externalId, caption: t.caption, ts: new Date(), permalink: `https://example.test/${platform}/${externalId}` }
      published.set(c.account.externalId, [...(published.get(c.account.externalId) ?? []), record])
      return { externalId, permalink: record.permalink }
    },
    async findRecent(c, since) {
      return (published.get(c.account.externalId) ?? []).filter(p => p.ts >= since)
    },
    async fetchPostStates(c, ids) {
      const live = published.get(c.account.externalId) ?? []
      return ids.map(id => fakeRemovedPosts.has(id)
        ? { externalId: id, removed: true as const }
        : { externalId: id, caption: fakeEditedCaptions.get(id) ?? live.find(p => p.externalId === id)?.caption ?? null, permalink: null, metrics: { views: 120, likes: 12, comments: 3 } })
    },
    async sendPrivateReply(c, commentId, text) {
      const failure = /fail-(auth|rate_limit|permanent|transient)/.exec(commentId)?.[1] as AdapterError['kind'] | undefined
      if (failure) throw new ChannelError({ kind: failure, code: `FAKE_${failure.toUpperCase()}`, message: `Fake ${failure} failure` })
      fakeOutbox.push({ kind: 'dm', accountId: c.account.id, commentId, text })
    },
    async replyToComment(c, commentId, text) {
      fakeOutbox.push({ kind: 'reply', accountId: c.account.id, commentId, text })
    },
    normalizeError: e => (e instanceof ChannelError ? e.detail : { kind: 'transient', message: String(e) })
  }
}

/** Tests only. */
export function resetFakeChannels() {
  published.clear()
  containers.clear()
  fakeOutbox.length = 0
  fakeRemovedPosts.clear()
  fakeEditedCaptions.clear()
}

export const isFakeMode = () => env().ADAPTER_MODE === 'fake'
