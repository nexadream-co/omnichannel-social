import { listGateways } from '../../../core/admin/billing'

export default defineEventHandler(async event => listGateways(await requirePermission(event, 'payments.read')))
