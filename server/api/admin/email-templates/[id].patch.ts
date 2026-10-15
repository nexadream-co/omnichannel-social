import { emailTemplatePatchSchema, updateEmailTemplate } from '../../../core/admin/templates'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'email-templates.write')
  return updateEmailTemplate(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, emailTemplatePatchSchema))
})
