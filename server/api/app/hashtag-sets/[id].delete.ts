import { deleteHashtagSet } from '../../../core/hashtags/sets'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  await deleteHashtagSet(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
