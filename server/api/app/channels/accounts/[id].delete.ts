import { disconnectSocialAccount } from '../../../../core/social-accounts'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  requireNotImpersonating(ctx)
  return disconnectSocialAccount(ctx, getRouterParam(event, 'id') ?? '')
})
