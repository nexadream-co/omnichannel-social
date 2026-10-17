/** Payment provider catalog and our own status vocabulary (docs/blueprint/08 §4). Data, not provider code. */

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge'] as const
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number]
export const BILLING_PERIODS = ['monthly', 'yearly'] as const
export type BillingPeriod = (typeof BILLING_PERIODS)[number]

export interface PaymentCredentialFieldMeta {
  key: 'serverKey' | 'clientKey' | 'merchantId' | 'baseUrl' | 'orderPrefix'
  label: string
  hint?: string
  placeholder?: string
  secret: boolean
}

export interface PaymentProviderMeta {
  value: string
  label: string
  description: string
  icon: string
  docsUrl: string
  isImplemented: boolean
  supportsRecurring: boolean
  supportsSandbox: boolean
  /** Test mode only: never offered, activated or used when NUXT_PUBLIC_APP_ENV is production. */
  testOnly?: boolean
  fields: PaymentCredentialFieldMeta[]
}

export const PAYMENT_PROVIDERS: PaymentProviderMeta[] = [
  {
    value: 'simulator',
    label: 'Simulator pembayaran (mode uji)',
    description: 'Pembayaran pura-pura untuk pengembangan dan staging. Halaman bayar tiruan memilih hasilnya: berhasil, gagal, kedaluwarsa, ditinjau, dibatalkan atau dikembalikan. Tidak ada uang sungguhan. Tidak tersedia di produksi.',
    icon: 'i-lucide-flask-conical',
    docsUrl: '',
    isImplemented: true,
    supportsRecurring: false,
    supportsSandbox: true,
    testOnly: true,
    fields: []
  },
  {
    value: 'nexadream_hub',
    label: 'Nexadream Payment Hub',
    description: 'Satu akun merchant Nexadream dipakai bersama. Mendukung kartu, VA bank, e-wallet dan QRIS, tanpa menyimpan kunci rahasia gateway di platform.',
    icon: 'i-lucide-credit-card',
    docsUrl: 'https://nexadream.id/docs/payment-hub',
    isImplemented: true,
    supportsRecurring: false,
    supportsSandbox: false,
    fields: [
      { key: 'serverKey', label: 'Kunci API', secret: true, placeholder: 'phk_live_…', hint: 'Kunci platform dari Payment Hub, diawali phk_live_. Disimpan terenkripsi dan tidak pernah ditampilkan lagi.' },
      { key: 'baseUrl', label: 'Alamat Payment Hub', secret: false, placeholder: 'https://nexadream.id', hint: 'Tanpa garis miring di akhir.' },
      { key: 'orderPrefix', label: 'Prefiks nomor pesanan', secret: false, placeholder: 'SOCIALZ', hint: 'Prefiks yang diberikan Payment Hub untuk Socialz.id. Dipakai untuk mencocokkan callback dengan pembayaran.' }
    ]
  }
]

/** "Menunggu pembayaran": still payable on the hosted page. */
export function isAwaitingPayment(p: { status: string, expiresAt: string | Date | null }, now: Date = new Date()): boolean {
  return (p.status === 'pending' || p.status === 'challenge') && (!p.expiresAt || new Date(p.expiresAt) > now)
}

export const PAYMENT_STATUS_KEYS: Record<PaymentStatusValue, string> = {
  pending: 'billing.paymentStatus.pending',
  paid: 'billing.paymentStatus.paid',
  failed: 'billing.paymentStatus.failed',
  expired: 'billing.paymentStatus.expired',
  refunded: 'billing.paymentStatus.refunded',
  cancelled: 'billing.paymentStatus.cancelled',
  challenge: 'billing.paymentStatus.challenge'
}

/** The raw words a card/QRIS gateway sends for each outcome; the simulator speaks them so the callback path is exercised. */
export const SIMULATED_GATEWAY_WORDS: Record<PaymentStatusValue, string> = {
  pending: 'pending', paid: 'settlement', failed: 'deny', expired: 'expire', refunded: 'refund', cancelled: 'cancel', challenge: 'challenge'
}
