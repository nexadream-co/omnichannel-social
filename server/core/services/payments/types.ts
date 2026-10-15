import type { PaymentStatusValue } from '../../../../shared/utils/payments'

/** The driver contract (docs/blueprint/08 §2): the only place business code imports payment types from. */
export interface GatewayCredentials {
  provider: string
  serverKey: string
  clientKey: string
  merchantId?: string | null
  baseUrl?: string | null
  orderPrefix?: string | null
  isSandbox: boolean
  config?: Record<string, unknown> | null
}

export interface ChargeCustomer { name: string, email?: string | null, phone?: string | null }

export interface CreateChargeInput {
  orderId: string
  amount: number // integer rupiah
  currency: string
  itemName: string
  customer: ChargeCustomer
  successUrl: string
  failureUrl: string
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export interface CreateChargeResult {
  orderId: string
  gatewayOrderId?: string
  redirectUrl: string
  token?: string
  clientKey?: string
  expiresAt?: Date
  raw?: Record<string, unknown>
}

export interface NormalizedPayment {
  orderId: string // OUR order id
  status: PaymentStatusValue
  rawStatus: string
  amount: number
  currency: string
  paymentType?: string | null
  paidAt?: Date | null
  raw?: Record<string, unknown>
}

export interface CancelChargeResult extends NormalizedPayment { alreadyCancelled: boolean }

export interface CreateSubscriptionInput {
  name: string
  amount: number
  currency: string
  period: 'monthly' | 'yearly'
  customer: ChargeCustomer
  paymentToken: string
  startAt?: Date
  metadata?: Record<string, unknown>
}
export interface SubscriptionResult { providerRef: string, status: string, raw?: Record<string, unknown> }

export interface PaymentDriver {
  readonly provider: string
  /** true: shared signing secret → verify then apply the payload. false: unsigned nudge → getStatus(). */
  readonly trustsWebhookPayload: boolean
  createCharge(creds: GatewayCredentials, input: CreateChargeInput, fetchImpl?: typeof fetch): Promise<CreateChargeResult>
  createSubscription(creds: GatewayCredentials, input: CreateSubscriptionInput, fetchImpl?: typeof fetch): Promise<SubscriptionResult>
  cancelSubscription(creds: GatewayCredentials, providerRef: string, fetchImpl?: typeof fetch): Promise<void>
  cancelCharge(creds: GatewayCredentials, orderId: string, fetchImpl?: typeof fetch): Promise<CancelChargeResult>
  getStatus(creds: GatewayCredentials, orderId: string, fetchImpl?: typeof fetch): Promise<NormalizedPayment>
  verifyWebhook(creds: GatewayCredentials, payload: Record<string, unknown>, headers: Record<string, string | undefined>): boolean
  normalizeWebhook(payload: Record<string, unknown>): NormalizedPayment
  webhookOrderId(payload: Record<string, unknown>): string | null
  webhookDedupeSource(payload: Record<string, unknown>): string
  webhookStatus(payload: Record<string, unknown>): string | null
  redirectOrderId(query: Record<string, unknown>): string | null
}
