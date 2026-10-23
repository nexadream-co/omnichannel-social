import { createMoment, momentSchema } from '../../../core/planner/moments'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'moments.write')
  return createMoment(ctx, await readValidatedJson(event, momentSchema))
})
