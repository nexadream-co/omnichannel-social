import { adminDashboard } from '../../core/admin/overview'

export default defineEventHandler(async event => adminDashboard(await requirePermission(event, 'dashboard.read')))
