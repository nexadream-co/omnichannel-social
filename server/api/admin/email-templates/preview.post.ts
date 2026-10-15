import { emailPreviewSchema, previewEmailTemplate } from '../../../core/admin/templates'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'email-templates.read')
  return previewEmailTemplate(ctx, await readValidatedJson(event, emailPreviewSchema))
})
