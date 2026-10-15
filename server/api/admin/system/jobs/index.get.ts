import { jobsOverview } from '../../../../core/admin/overview'

export default defineEventHandler(async event => jobsOverview(await requirePermission(event, 'settings.read')))
