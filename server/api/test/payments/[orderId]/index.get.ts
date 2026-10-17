import { getSimulatedCharge } from '../../../../core/payment-simulator'

/** Test mode only (404 in production): the simulated hosted payment page's data. */
export default defineEventHandler(async event => getSimulatedCharge(requestContext(event), getRouterParam(event, 'orderId') ?? ''))
