import { staffUpdateSchema, updateStaff } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'staff.write')
  await updateStaff(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, staffUpdateSchema))
  return { ok: true }
})
