import { planPatchSchema, updatePlan } from '../../../core/admin/plans'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'plans.write')
  return updatePlan(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, planPatchSchema))
})
