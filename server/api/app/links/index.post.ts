import type { Database } from '../../../core/db/client'
import { kick } from '../../../core/jobs'
import { createLink, linkSchema } from '../../../core/links/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const result = await createLink(ctx, await readValidatedJson(event, linkSchema))
  // Autofill runs right away so the card fills in while the creator watches.
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [result.jobId]))
  return { link: result.link, customIgnored: result.customIgnored }
})
