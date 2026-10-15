import { notificationTemplatePatchSchema, updateNotificationTemplate } from '../../../core/admin/templates'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'notification-templates.write')
  return updateNotificationTemplate(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, notificationTemplatePatchSchema))
})
