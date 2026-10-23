import { rhythmSchema, setRhythm } from '../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return setRhythm(ctx, await readValidatedJson(event, rhythmSchema))
})
