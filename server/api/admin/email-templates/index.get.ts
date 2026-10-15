import { listEmailTemplates } from '../../../core/admin/templates'

export default defineEventHandler(async event => listEmailTemplates(await requirePermission(event, 'email-templates.read')))
