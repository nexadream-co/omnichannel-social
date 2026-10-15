import { memberUpdateSchema, updateMember } from '../../../../core/team'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateMember(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, memberUpdateSchema))
})
