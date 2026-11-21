import { postTemplateSchema, updatePostTemplate } from '../../../core/templates/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updatePostTemplate(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, postTemplateSchema.partial()))
})
