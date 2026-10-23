import { momentPatchSchema, updateMoment } from '../../../core/planner/moments'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'moments.write')
  await updateMoment(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, momentPatchSchema))
  return { ok: true }
})
