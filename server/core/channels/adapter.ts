import type { ChannelCapabilities, MediaKind, Platform, PostFormat } from '../../../shared/channels/types'
import type { TagActivity } from '../../../shared/hashtags/types'
import type { Logger } from '../log'

export interface DecryptedSocialAccount {
  id: string
  platform: Platform
  externalId: string
  accessToken: string
  refreshToken: string | null
  meta: Record<string, unknown>
}

export interface AdapterCtx {
  account: DecryptedSocialAccount
  fetch: typeof fetch // injected, so tests can pass a fake
  log: Logger
}

/** One connectable account returned by an OAuth exchange (Facebook can return several Pages). */
export interface ConnectedAccount {
  externalId: string
  username: string | null
  avatarUrl: string | null
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  scopes: string[]
  meta: Record<string, unknown>
}

/** Optional extras an admin has switched on; each adapter maps them to its own permissions. */
export interface OAuthOptions {
  tagSearch?: boolean
}

export interface TokenBundle {
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
}

export interface ResolvedTarget {
  format: PostFormat
  caption: string
  /** `coverMs`: the frame the creator picked as the video cover (media editor), from the start of the video. */
  media: { url: string, kind: MediaKind, coverMs?: number | null }[]
  options: { firstComment?: string, altText?: string, linkAttachment?: string }
}

export interface AdapterError {
  kind: 'auth' | 'rate_limit' | 'quota' | 'validation' | 'transient' | 'permanent'
  code?: string
  subcode?: string
  message: string
  retryAfter?: Date
  fbtraceId?: string
}

/**
 * A published post as the platform has it now (the source of truth after publishing): `removed` when the platform
 * says it no longer exists. `caption: null` = the platform did not say (leave ours alone); `metrics: null` = no numbers.
 */
export type PlatformPostState = { externalId: string, removed: true } | { externalId: string, caption: string | null, permalink: string | null, metrics: Record<string, number> | null }

/**
 * The main extension point (ARCHITECTURE §6.2). Adding TikTok/YouTube/X = one capabilities file + one adapter.
 * Vendor vocabulary (Graph fields, error codes) never leaves the adapter files.
 */
export interface ChannelAdapter {
  caps: ChannelCapabilities
  apiVersion: string
  isConfigured(): boolean
  oauth: {
    authorizeUrl(state: string, redirectUri: string, options?: OAuthOptions): string
    exchange(code: string, redirectUri: string, fetchImpl: typeof fetch, options?: OAuthOptions): Promise<ConnectedAccount[]>
    refresh?(token: TokenBundle, fetchImpl: typeof fetch): Promise<TokenBundle>
  }
  getQuota?(c: AdapterCtx): Promise<{ used: number, limit: number }>
  prepare(c: AdapterCtx, t: ResolvedTarget): Promise<{ containerIds: string[] } | { ready: true }>
  checkStatus(c: AdapterCtx, containerIds: string[]): Promise<'pending' | 'ready' | AdapterError>
  publish(c: AdapterCtx, t: ResolvedTarget, containerIds: string[]): Promise<{ externalId: string, permalink?: string }>
  findRecent(c: AdapterCtx, since: Date): Promise<{ externalId: string, caption: string, ts: Date, permalink?: string }[]>
  /** One row per post the platform answered for; posts it refuses to report on are left out. */
  fetchPostStates?(c: AdapterCtx, externalIds: string[]): Promise<PlatformPostState[]>
  sendPrivateReply?(c: AdapterCtx, commentId: string, text: string): Promise<void>
  replyToComment?(c: AdapterCtx, commentId: string, text: string): Promise<void>
  /** Public tag activity for tag research. Optional, and only for accounts that granted the extra permission. */
  tagSearch?: {
    allowed(scopes: string[]): boolean
    activity(c: AdapterCtx, tag: string): Promise<TagActivity>
  }
  normalizeError(e: unknown): AdapterError
}

/** Thrown inside adapters for expected, already-classified failures. */
export class ChannelError extends Error {
  constructor(public readonly detail: AdapterError) {
    super(detail.message)
    this.name = 'ChannelError'
  }
}
