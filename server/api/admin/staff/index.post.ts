import { inviteStaff, staffInviteSchema } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'staff.write')
  await inviteStaff(ctx, await readValidatedJson(event, staffInviteSchema))
  return { ok: true }
})
