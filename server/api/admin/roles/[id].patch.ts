import { roleSchema, updateRole } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'roles.write')
  await updateRole(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, roleSchema.partial()))
  return { ok: true }
})
