import { listPlans } from '../../../core/admin/plans'

export default defineEventHandler(async event => listPlans(await requirePermission(event, 'plans.read')))
