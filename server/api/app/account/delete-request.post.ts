import { deleteRequestSchema, requestWorkspaceDeletion } from '../../../core/account'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  requireNotImpersonating(ctx)
  return requestWorkspaceDeletion(ctx, await readValidatedJson(event, deleteRequestSchema))
})
