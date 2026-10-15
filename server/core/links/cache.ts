/** Per-instance LRU of slug → destination (30 s, best effort; a cold instance just misses). docs/blueprint/01 §7 */
export interface ResolvedSlug {
  shortLinkId: string
  workspaceId: string
  destinationUrl: string | null // null = disabled or archived
  bioHandle: string | null
}

const TTL_MS = 30_000
const MAX = 50_000
const key = Symbol.for('socialz.slug-cache')
type G = typeof globalThis & { [key]?: Map<string, { at: number, value: ResolvedSlug | null }> }

function cache() {
  const g = globalThis as G
  g[key] ??= new Map()
  return g[key]!
}

export function getCachedSlug(slug: string): ResolvedSlug | null | undefined {
  const hit = cache().get(slug)
  if (!hit) return undefined
  if (Date.now() - hit.at > TTL_MS) {
    cache().delete(slug)
    return undefined
  }
  return hit.value
}

export function setCachedSlug(slug: string, value: ResolvedSlug | null) {
  const map = cache()
  if (map.size >= MAX) map.delete(map.keys().next().value!)
  map.set(slug, { at: Date.now(), value })
}
