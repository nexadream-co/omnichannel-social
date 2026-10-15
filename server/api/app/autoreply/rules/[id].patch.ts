import { z } from 'zod'
import { setRuleActive } from '../../../../core/autoreply/rules'

/** The on/off toggle on the rules list. */
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { active } = await readValidatedJson(event, z.object({ active: z.boolean() }))
  return setRuleActive(ctx, getRouterParam(event, 'id') ?? '', active)
})
