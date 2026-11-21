import { createPostTemplate, postTemplateSchema } from '../../../core/templates/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return createPostTemplate(ctx, await readValidatedJson(event, postTemplateSchema))
})
