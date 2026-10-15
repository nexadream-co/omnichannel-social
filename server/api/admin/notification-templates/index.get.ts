import { listNotificationTemplates } from '../../../core/admin/templates'

export default defineEventHandler(async event => listNotificationTemplates(await requirePermission(event, 'notification-templates.read')))
