import { listMoments, momentQuerySchema } from '../../../core/planner/moments'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'moments.read')
  return listMoments(ctx, validatedQuery(event, momentQuerySchema))
})
