import { ruleSchema, updateRule } from '../../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateRule(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, ruleSchema))
})
