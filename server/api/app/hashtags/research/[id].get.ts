import { getResearchRun } from '../../../../core/hashtags/research'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return getResearchRun(ctx, getRouterParam(event, 'id') ?? '')
})
