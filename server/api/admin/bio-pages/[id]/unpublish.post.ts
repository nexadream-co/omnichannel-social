import { moderationSchema, unpublishBioAdmin } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'links.write')
  const { reason } = await readValidatedJson(event, moderationSchema)
  await unpublishBioAdmin(ctx, getRouterParam(event, 'id') ?? '', reason)
  return { ok: true }
})
