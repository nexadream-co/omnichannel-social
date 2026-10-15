import { gatewayPatchSchema, updateGateway } from '../../../core/admin/billing'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'payments.write')
  return updateGateway(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, gatewayPatchSchema))
})
