import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { uuidv7 } from 'uuidv7'
import type { CoreContext } from '../core/context'
import { getDb } from '../core/db/client'
import { log } from '../core/log'
import { clientIpFromHeaders } from '../core/rate-limit'

/** Builds the CoreContext for a request: after-response work goes through event.waitUntil (docs/blueprint/19 §2 rule 3). */
export function requestContext(event: H3Event): CoreContext {
  if (event.context.coreContext) return event.context.coreContext as CoreContext
  const requestId = getRequestHeader(event, 'x-request-id') || uuidv7()
  const logger = log.child({ requestId, path: event.path })
  const ctx: CoreContext = {
    db: getDb(),
    log: logger,
    defer: work => event.waitUntil(work.catch(error => logger.error('defer.failed', { error }))),
    requestId,
    ip: clientIpFromHeaders(new Headers(getRequestHeaders(event) as Record<string, string>)),
    userAgent: getRequestHeader(event, 'user-agent') ?? null
  }
  event.context.coreContext = ctx
  return ctx
}
