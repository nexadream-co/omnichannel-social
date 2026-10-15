import { deletePlan } from '../../../core/admin/plans'

export default defineEventHandler(async event => deletePlan(await requirePermission(event, 'plans.write'), getRouterParam(event, 'id') ?? ''))
