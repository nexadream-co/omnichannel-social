import { revokeCreatorSessions } from '../../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requireSuperAdmin(event)
  await revokeCreatorSessions(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
