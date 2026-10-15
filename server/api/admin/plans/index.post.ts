import { createPlan, planSchema } from '../../../core/admin/plans'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'plans.write')
  return createPlan(ctx, await readValidatedJson(event, planSchema))
})
