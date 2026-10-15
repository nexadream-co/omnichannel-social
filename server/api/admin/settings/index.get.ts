import { getAdminSettings } from '../../../core/admin/settings'

export default defineEventHandler(async event => getAdminSettings(await requirePermission(event, 'settings.read')))
