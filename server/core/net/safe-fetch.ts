import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

/**
 * Fetches a creator-supplied URL safely (ARCHITECTURE §11): https only, private/link-local/metadata
 * addresses blocked (v4 + v6), the vetted IP pinned for the connection (no DNS rebinding), every
 * redirect re-checked (max 3), 5 s timeout, 2 MB cap.
 */
const blocked = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) {
  blocked.addSubnet(net, prefix, 'ipv6')
}

export class SafeFetchError extends Error {
  constructor(public readonly reason: 'scheme' | 'blocked_address' | 'dns' | 'too_many_redirects' | 'too_large' | 'timeout' | 'http', message: string) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

export function isBlockedAddress(address: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is checked as the IPv4 it wraps. (Adding ::ffff:0:0/96 to the
  // BlockList would make Node match every plain IPv4 against it.)
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address)
  const fromHex = hex ? [parseInt(hex[1]!, 16) >> 8, parseInt(hex[1]!, 16) & 255, parseInt(hex[2]!, 16) >> 8, parseInt(hex[2]!, 16) & 255].join('.') : null
  const candidate = dotted ?? fromHex ?? address
  const family = isIP(candidate)
  if (!family) return true
  return blocked.check(candidate, family === 4 ? 'ipv4' : 'ipv6')
}

async function vet(hostname: string): Promise<{ address: string, family: 4 | 6 }> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SafeFetchError('blocked_address', 'Address not allowed')
    return { address: host, family: isIP(host) as 4 | 6 }
  }
  let records: { address: string, family: number }[]
  try {
    records = await dnsLookup(host, { all: true, verbatim: true })
  } catch {
    throw new SafeFetchError('dns', 'Host not found')
  }
  // Every resolved address must be public; one private answer is enough to refuse.
  if (!records.length || records.some(r => isBlockedAddress(r.address))) throw new SafeFetchError('blocked_address', 'Address not allowed')
  return { address: records[0]!.address, family: records[0]!.family as 4 | 6 }
}

export interface SafeResponse {
  url: string
  status: number
  contentType: string
  body: Uint8Array
}

export async function safeFetch(input: string, options: { maxBytes?: number, timeoutMs?: number, maxRedirects?: number, accept?: string } = {}): Promise<SafeResponse> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 5_000)
  let url = new URL(input)
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
    if (url.protocol !== 'https:') throw new SafeFetchError('scheme', 'Only https is allowed')
    const pinned = await vet(url.hostname)
    const dispatcher = new Agent({
      connect: {
        // Connect to exactly the address we vetted, whatever DNS says now.
        lookup: (_host, _opts, callback) => callback(null, [{ address: pinned.address, family: pinned.family }])
      }
    })
    try {
      const response = await undiciFetch(url, {
        dispatcher,
        redirect: 'manual',
        signal: deadline,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SocialzBot/1.0; +https://socialz.id)', 'accept': options.accept ?? 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5', 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' }
      })
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        url = new URL(response.headers.get('location')!, url)
        await response.body?.cancel()
        continue
      }
      if (!response.ok) throw new SafeFetchError('http', `HTTP ${response.status}`)
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > maxBytes) throw new SafeFetchError('too_large', 'Response too large')
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const chunk of response.body ?? []) {
        size += (chunk as Uint8Array).length
        if (size > maxBytes) throw new SafeFetchError('too_large', 'Response too large')
        chunks.push(chunk as Uint8Array)
      }
      const body = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.length
      }
      return { url: url.toString(), status: response.status, contentType: response.headers.get('content-type') ?? '', body }
    } catch (error) {
      if (error instanceof SafeFetchError) throw error
      if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') throw new SafeFetchError('timeout', 'Timed out')
      throw new SafeFetchError('http', (error as Error).message)
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  }
  throw new SafeFetchError('too_many_redirects', 'Too many redirects')
}
