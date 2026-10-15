import { acceptStaffInvitation, acceptStaffSchema } from '../../../core/admin/people'
import { assertRateLimit } from '../../../core/rate-limit'

export default defineEventHandler(async (event) => {
  const ctx = requestContext(event)
  await assertRateLimit('staff-invite-accept', ctx.ip ?? 'unknown', 10, 15 * 60_000)
  return acceptStaffInvitation(ctx, await readValidatedJson(event, acceptStaffSchema))
})
