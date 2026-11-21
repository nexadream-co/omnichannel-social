import { deletePostTemplate } from '../../../core/templates/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  await deletePostTemplate(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
