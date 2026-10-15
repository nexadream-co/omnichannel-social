import { eq } from 'drizzle-orm'
import { decrypt } from '../../crypto'
import type { Executor } from '../../db/client'
import { getDb } from '../../db/client'
import { paymentGateways } from '../../db/schema'
import { appError } from '../../errors'
import { nexadreamHubDriver } from './nexadream-hub'
import type { GatewayCredentials, PaymentDriver } from './types'

export type * from './types'

/** Adding a gateway = one driver file + one line here + one PAYMENT_PROVIDERS entry (docs/blueprint/08 §10). */
const DRIVERS: Record<string, PaymentDriver> = {
  [nexadreamHubDriver.provider]: nexadreamHubDriver
}

/** Tests only: swap a driver for a fake. */
export function registerPaymentDriver(driver: PaymentDriver) {
  DRIVERS[driver.provider] = driver
}

export function isSupportedProvider(provider: string): boolean {
  return Object.hasOwn(DRIVERS, provider)
}

export function getPaymentDriver(provider: string): PaymentDriver {
  const driver = DRIVERS[provider]
  if (!driver) throw appError(400, 'Gateway pembayaran tidak dikenal.', 'VALIDATION_FAILED')
  return driver
}

export function listPaymentDrivers(): string[] {
  return Object.keys(DRIVERS)
}

/** AAD binds each secret to its gateway row and field, so ciphertexts can't be swapped between rows. */
export const gatewaySecretAad = (provider: string, field: 'serverKey' | 'clientKey') => `payment_gateway|${provider}|${field}`

/** The one place a stored row becomes usable credentials. */
function toCredentials(row: typeof paymentGateways.$inferSelect): GatewayCredentials {
  return {
    provider: row.provider,
    serverKey: decrypt(row.serverKey, gatewaySecretAad(row.provider, 'serverKey')),
    clientKey: row.clientKey ? decrypt(row.clientKey, gatewaySecretAad(row.provider, 'clientKey')) : '',
    merchantId: row.merchantId,
    baseUrl: row.baseUrl,
    orderPrefix: row.orderPrefix,
    isSandbox: row.isSandbox,
    config: (row.config as Record<string, unknown> | null) ?? null
  }
}

export async function getActiveGateway(db: Executor = getDb()): Promise<{ driver: PaymentDriver, creds: GatewayCredentials } | null> {
  const [row] = await db.select().from(paymentGateways).where(eq(paymentGateways.isActive, true)).limit(1)
  if (!row?.serverKey || !isSupportedProvider(row.provider)) return null
  const creds = toCredentials(row)
  if (!creds.serverKey) return null
  return { driver: getPaymentDriver(row.provider), creds }
}

export async function getGatewayCredentials(provider: string, db: Executor = getDb()): Promise<GatewayCredentials | null> {
  const [row] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider)).limit(1)
  if (!row?.serverKey) return null
  const creds = toCredentials(row)
  return creds.serverKey ? creds : null
}

export function requireActiveGateway<T>(gateway: T | null): T {
  if (!gateway) throw appError(503, 'Pembayaran sedang tidak tersedia, hubungi dukungan.', 'SERVER_ERROR')
  return gateway
}
