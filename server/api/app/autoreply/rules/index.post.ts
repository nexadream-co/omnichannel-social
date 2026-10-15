import { createRule, ruleSchema } from '../../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return createRule(ctx, await readValidatedJson(event, ruleSchema))
})
