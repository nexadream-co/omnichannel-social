import { moderationSchema, setLinkActive } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'links.write')
  const { reason } = await readValidatedJson(event, moderationSchema)
  await setLinkActive(ctx, getRouterParam(event, 'id') ?? '', false, reason)
  return { ok: true }
})
