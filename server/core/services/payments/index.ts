import { eq } from 'drizzle-orm'
import { decrypt } from '../../crypto'
import type { Executor } from '../../db/client'
import { getDb } from '../../db/client'
import { paymentGateways } from '../../db/schema'
import { appError } from '../../errors'
import { PAYMENT_PROVIDERS } from '../../../../shared/utils/payments'
import { nexadreamHubDriver } from './nexadream-hub'
import { simulatorAllowed, simulatorDriver } from './simulator'
import type { GatewayCredentials, PaymentDriver } from './types'

export type * from './types'

/** Adding a gateway = one driver file + one line here + one PAYMENT_PROVIDERS entry (docs/blueprint/08 §10). */
const DRIVERS: Record<string, PaymentDriver> = {
  [nexadreamHubDriver.provider]: nexadreamHubDriver,
  [simulatorDriver.provider]: simulatorDriver
}

/** Tests only: swap a driver for a fake. */
export function registerPaymentDriver(driver: PaymentDriver) {
  DRIVERS[driver.provider] = driver
}

/** Test-only providers (the simulator) don't exist in production: not listed, not activatable, never used. */
export function isProviderAvailable(provider: string): boolean {
  const meta = PAYMENT_PROVIDERS.find(p => p.value === provider)
  return Boolean(meta) && (!meta!.testOnly || simulatorAllowed())
}

export function isSupportedProvider(provider: string): boolean {
  return Object.hasOwn(DRIVERS, provider) && isProviderAvailable(provider)
}

/** A gateway is usable when every secret its catalog entry asks for is stored (the simulator asks for none). */
function needsServerKey(provider: string): boolean {
  return PAYMENT_PROVIDERS.find(p => p.value === provider)?.fields.some(f => f.key === 'serverKey') ?? true
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
  if (!row || !isSupportedProvider(row.provider)) return null
  const creds = toCredentials(row)
  if (needsServerKey(row.provider) && !creds.serverKey) return null
  return { driver: getPaymentDriver(row.provider), creds }
}

export async function getGatewayCredentials(provider: string, db: Executor = getDb()): Promise<GatewayCredentials | null> {
  const [row] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider)).limit(1)
  if (!row || !isProviderAvailable(provider)) return null
  const creds = toCredentials(row)
  return !needsServerKey(provider) || creds.serverKey ? creds : null
}

export function requireActiveGateway<T>(gateway: T | null): T {
  if (!gateway) throw appError(503, 'Pembayaran sedang tidak tersedia, hubungi dukungan.', 'SERVER_ERROR')
  return gateway
}
