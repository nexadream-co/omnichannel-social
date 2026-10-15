import { env } from '../core/env'
import { appError } from '../core/errors'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** CSRF guard for mutating /api/app/** and /api/admin/** requests (docs/blueprint/12 §6). */
export default defineEventHandler((event) => {
  if (SAFE.has(event.method)) return
  const path = event.path
  if (!path.startsWith('/api/app/') && !path.startsWith('/api/admin/')) return
  const origin = getRequestHeader(event, 'origin')
  const fetchSite = getRequestHeader(event, 'sec-fetch-site')
  if (origin === env().siteOrigin || (!origin && fetchSite === 'same-origin')) return
  throw appError(403, 'Permintaan ditolak.', 'FORBIDDEN')
})
