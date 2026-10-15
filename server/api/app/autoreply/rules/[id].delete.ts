import { deleteRule } from '../../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  await deleteRule(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
