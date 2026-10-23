import { autoReplyHint } from '../../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { hint: await autoReplyHint(ctx, getRouterParam(event, 'id') ?? '') }
})
