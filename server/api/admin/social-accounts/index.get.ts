import { accountsQuery, listSocialAccountsAdmin } from '../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'channels.read')
  return listSocialAccountsAdmin(ctx, validatedQuery(event, accountsQuery))
})
