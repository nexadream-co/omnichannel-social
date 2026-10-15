import { listMetaWebhooks, metaWebhooksQuery } from '../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'channels.read')
  return listMetaWebhooks(ctx, validatedQuery(event, metaWebhooksQuery))
})
