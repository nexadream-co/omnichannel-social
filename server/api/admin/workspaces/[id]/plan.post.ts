import { overridePlan, planOverrideSchema } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'subscriptions.write')
  await overridePlan(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, planOverrideSchema))
  return { ok: true }
})
