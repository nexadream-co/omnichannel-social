import { createRole, roleSchema } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'roles.write')
  await createRole(ctx, await readValidatedJson(event, roleSchema))
  return { ok: true }
})
