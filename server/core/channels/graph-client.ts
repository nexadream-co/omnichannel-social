import { createHmac } from 'node:crypto'
import type { AdapterError, PlatformPostState } from './adapter'

/** A failed Graph call, with Meta's error fields parsed (code, error_subcode, fbtrace_id). */
export class GraphError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
    public readonly subcode: number | null,
    message: string,
    public readonly fbtraceId: string | null,
    public readonly isTransient: boolean
  ) {
    super(message)
    this.name = 'GraphError'
  }
}

export interface GraphRequest {
  fetch: typeof fetch
  url: string
  method?: 'GET' | 'POST' | 'DELETE'
  params?: Record<string, string | number | boolean | undefined | null>
  accessToken?: string
  /** Facebook requires appsecret_proof on every call made with a token. */
  appSecret?: string
  timeoutMs?: number
  headers?: Record<string, string>
}

export function appSecretProof(appSecret: string, accessToken: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

/** All Graph HTTP goes through here: timeouts, appsecret_proof, error parsing (ARCHITECTURE §6.3). */
export async function graphRequest<T>(request: GraphRequest): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(request.params ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  if (request.accessToken) {
    params.set('access_token', request.accessToken)
    if (request.appSecret) params.set('appsecret_proof', appSecretProof(request.appSecret, request.accessToken))
  }
  const method = request.method ?? 'GET'
  const url = method === 'GET' || method === 'DELETE' ? `${request.url}?${params}` : request.url
  let response: Response
  try {
    response = await request.fetch(url, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded', ...request.headers } : request.headers,
      body: method === 'POST' ? params.toString() : undefined,
      signal: AbortSignal.timeout(request.timeoutMs ?? 20_000)
    })
  } catch (error) {
    throw new GraphError(0, null, null, `Network error: ${(error as Error).message}`, null, true)
  }
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // non-JSON body (HTML error page)
  }
  const error = (json as { error?: { message?: string, code?: number, error_subcode?: number, fbtrace_id?: string, is_transient?: boolean } } | null)?.error
  if (!response.ok || error) {
    throw new GraphError(response.status, error?.code ?? null, error?.error_subcode ?? null, error?.message ?? `HTTP ${response.status}`, error?.fbtrace_id ?? null, Boolean(error?.is_transient) || response.status >= 500)
  }
  return json as T
}

type PostState = Omit<Extract<PlatformPostState, { caption: unknown }>, 'externalId'>

/**
 * Post states fetched one by one. A post Graph no longer has (code 100, subcode 33: deleted on the platform) comes
 * back as `removed`; a post the platform refuses to report on (other validation errors) is skipped. Anything else
 * (auth, rate limit, outage) stops the batch, since it concerns the whole account.
 */
export async function postStatesPerPost(externalIds: string[], fetchOne: (id: string) => Promise<PostState>): Promise<PlatformPostState[]> {
  const rows: PlatformPostState[] = []
  for (const externalId of externalIds) {
    try {
      rows.push({ externalId, ...await fetchOne(externalId) })
    } catch (error) {
      if (error instanceof GraphError && error.code === 100 && error.subcode === 33) rows.push({ externalId, removed: true })
      else if (classifyGraphError(error).kind !== 'validation') throw error
    }
  }
  return rows
}

/** Numbers are optional: a post the platform won't give insights for (too old, a format without them) still syncs. */
export async function optionalMetrics(fetchMetrics: () => Promise<Record<string, number>>): Promise<Record<string, number> | null> {
  try {
    return await fetchMetrics()
  } catch (error) {
    if (classifyGraphError(error).kind === 'validation') return null
    throw error
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006, 80008, 80014])
const AUTH_CODES = new Set([102, 190, 10])
const MEDIA_NOT_READY = new Set([9007])
const MEDIA_NOT_READY_SUBCODES = new Set([2207027])
const QUOTA_SUBCODES = new Set([2207042])

/** Graph error → AdapterError kind (ARCHITECTURE §8.4 error routing). */
export function classifyGraphError(error: unknown): AdapterError {
  if (!(error instanceof GraphError)) {
    return { kind: 'transient', message: error instanceof Error ? error.message : String(error) }
  }
  const base = { code: error.code === null ? undefined : String(error.code), subcode: error.subcode === null ? undefined : String(error.subcode), message: error.message, fbtraceId: error.fbtraceId ?? undefined }
  if (error.code !== null && AUTH_CODES.has(error.code)) return { ...base, kind: 'auth' }
  if (error.code !== null && error.code >= 200 && error.code < 300) return { ...base, kind: 'auth' } // permission errors
  if (error.subcode !== null && QUOTA_SUBCODES.has(error.subcode)) return { ...base, kind: 'quota', retryAfter: new Date(Date.now() + 3_600_000) }
  if (error.code !== null && RATE_LIMIT_CODES.has(error.code)) return { ...base, kind: 'rate_limit', retryAfter: new Date(Date.now() + 15 * 60_000) }
  if ((error.code !== null && MEDIA_NOT_READY.has(error.code)) || (error.subcode !== null && MEDIA_NOT_READY_SUBCODES.has(error.subcode))) return { ...base, kind: 'transient' }
  if (error.isTransient || error.status === 0 || error.status >= 500 || error.code === 1 || error.code === 2) return { ...base, kind: 'transient' }
  if (error.code === 100 || (error.subcode !== null && error.subcode >= 2207000 && error.subcode < 2208000)) return { ...base, kind: 'validation' }
  return { ...base, kind: 'permanent' }
}
