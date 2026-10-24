<script setup lang="ts">
/**
 * Test mode: the simulated hosted payment page (docs/blueprint/08 §11). Stands in for the Payment Hub's page;
 * every button sends a gateway-style callback through the real receiver (except "tanpa callback").
 * 404 in production. Staff/developer tool, so Bahasa only.
 */
definePageMeta({ layout: false })
useHead({ title: 'Simulator pembayaran', meta: [{ name: 'robots', content: 'noindex' }] })

type Outcome = 'paid' | 'paid_no_callback' | 'challenge' | 'failed' | 'expired' | 'cancelled' | 'refunded'
interface Charge { orderId: string, gatewayOrderId: string, amount: number, itemName: string, customerName: string | null, status: string, appStatus: string | null, expiresAt: string | null, finishUrl: string | null, outcomes: Outcome[] }

const route = useRoute()
const toast = useToast()
const orderId = String(route.params.orderId)
const charge = ref<Charge | null>(null)
const error = ref<string | null>(null)
async function load() {
  try {
    charge.value = await apiFetch<Charge>(`/api/test/payments/${encodeURIComponent(orderId)}`)
  } catch (caught) {
    error.value = extractErrorMessage(caught, 'Pembayaran simulasi tidak ditemukan.')
  }
}
onMounted(load)

const OUTCOMES: Record<Outcome, { label: string, hint: string, icon: string, color: 'success' | 'warning' | 'error' | 'neutral' | 'info' }> = {
  paid: { label: 'Bayar berhasil', hint: 'Gateway mengirim callback "settlement". Paket langsung aktif.', icon: 'i-lucide-circle-check', color: 'success' },
  paid_no_callback: { label: 'Bayar berhasil, tanpa callback', hint: 'Uang "masuk" tapi callback hilang. Pembayaran tetap menunggu sampai rekonsiliasi harian (atau "Jalankan sekarang" billing.daily) membacanya.', icon: 'i-lucide-unplug', color: 'info' },
  challenge: { label: 'Ditinjau (challenge)', hint: 'Gateway menahan pembayaran untuk diperiksa. Paket belum aktif.', icon: 'i-lucide-shield-question', color: 'warning' },
  failed: { label: 'Gagal / ditolak', hint: 'Callback "deny". Masa tenggang hanya mulai jika paket memang sudah jatuh tempo.', icon: 'i-lucide-circle-x', color: 'error' },
  expired: { label: 'Kedaluwarsa', hint: 'Callback "expire", seperti pembeli yang meninggalkan halaman bayar.', icon: 'i-lucide-timer-off', color: 'neutral' },
  cancelled: { label: 'Dibatalkan', hint: 'Callback "cancel" dari sisi gateway.', icon: 'i-lucide-ban', color: 'neutral' },
  refunded: { label: 'Kembalikan dana', hint: 'Callback "refund" untuk pembayaran yang sudah lunas. Paket tidak otomatis dicabut.', icon: 'i-lucide-undo-2', color: 'warning' }
}
const ICON_COLOR = { success: 'text-success', info: 'text-info', warning: 'text-warning', error: 'text-error', neutral: 'text-muted' } as const
const METHODS = [{ value: 'qris', label: 'QRIS' }, { value: 'gopay', label: 'GoPay' }, { value: 'shopeepay', label: 'ShopeePay' }, { value: 'bank_transfer', label: 'Transfer bank (VA)' }, { value: 'credit_card', label: 'Kartu kredit/debit' }]
const paymentType = ref('qris')
const STATUS: Record<string, string> = { pending: 'Menunggu pembayaran', paid: 'Lunas', challenge: 'Ditinjau', failed: 'Gagal', expired: 'Kedaluwarsa', cancelled: 'Dibatalkan', refunded: 'Dikembalikan' }

const busy = ref<Outcome | null>(null)
async function choose(outcome: Outcome) {
  busy.value = outcome
  try {
    const result = await apiFetch<{ status: string, redirectUrl: string | null }>(`/api/test/payments/${encodeURIComponent(orderId)}/outcome`, { method: 'POST', body: { outcome, paymentType: paymentType.value } })
    if (result.redirectUrl) {
      window.location.href = result.redirectUrl
      return
    }
    toast.add({ title: `Status simulasi: ${STATUS[result.status] ?? result.status}`, color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal mensimulasikan.'), color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="min-h-dvh bg-elevated/40">
    <div class="bg-warning text-inverted text-center text-sm font-semibold py-2 px-4">
      MODE UJI · Simulator pembayaran. Tidak ada uang sungguhan.
    </div>
    <main class="mx-auto w-full max-w-md px-4 py-8 space-y-4">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <USkeleton
        v-else-if="!charge"
        class="h-80 w-full"
      />
      <template v-else>
        <UCard>
          <div class="space-y-1">
            <p class="text-xs text-muted">
              {{ charge.gatewayOrderId }}
            </p>
            <h1 class="text-lg font-semibold text-highlighted">
              {{ charge.itemName }}
            </h1>
            <p class="text-3xl font-bold text-highlighted">
              {{ formatIDR(charge.amount) }}
            </p>
            <p
              v-if="charge.customerName"
              class="text-sm text-muted"
            >
              Atas nama {{ charge.customerName }}
            </p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2 text-sm">
            <UBadge
              variant="subtle"
              color="neutral"
              :label="`Gateway: ${STATUS[charge.status] ?? charge.status}`"
            />
            <UBadge
              v-if="charge.appStatus"
              variant="subtle"
              color="info"
              :label="`Aplikasi: ${STATUS[charge.appStatus] ?? charge.appStatus}`"
            />
            <UBadge
              v-if="charge.expiresAt && charge.status === 'pending'"
              variant="outline"
              color="neutral"
              :label="`Berlaku sampai ${formatDateTime(charge.expiresAt)}`"
            />
          </div>
        </UCard>

        <UCard v-if="charge.outcomes.length">
          <template #header>
            <p class="font-semibold text-highlighted">
              Pilih hasil pembayaran
            </p>
          </template>
          <div class="space-y-4">
            <UFormField
              v-if="charge.outcomes.includes('paid')"
              label="Metode pembayaran"
            >
              <USelect
                v-model="paymentType"
                :items="METHODS"
                class="w-full"
              />
            </UFormField>
            <div class="space-y-2">
              <button
                v-for="outcome in charge.outcomes"
                :key="outcome"
                type="button"
                class="w-full text-left rounded-lg border border-default p-3 hover:bg-elevated/60 disabled:opacity-60 flex gap-3"
                :disabled="busy !== null"
                @click="choose(outcome)"
              >
                <UIcon
                  :name="busy === outcome ? 'i-lucide-loader-circle' : OUTCOMES[outcome].icon"
                  class="size-5 shrink-0 mt-0.5"
                  :class="[busy === outcome && 'motion-safe:animate-spin', ICON_COLOR[OUTCOMES[outcome].color]]"
                />
                <span>
                  <span class="block text-sm font-medium text-highlighted">{{ OUTCOMES[outcome].label }}</span>
                  <span class="block text-xs text-muted">{{ OUTCOMES[outcome].hint }}</span>
                </span>
              </button>
            </div>
          </div>
        </UCard>
        <UCard v-else>
          <p class="text-sm text-muted">
            Pembayaran ini sudah final di sisi gateway. Tidak ada hasil lain yang bisa disimulasikan.
          </p>
        </UCard>

        <UButton
          v-if="charge.finishUrl"
          :to="charge.finishUrl"
          external
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          label="Kembali ke aplikasi tanpa memilih"
          class="px-0"
        />
      </template>
    </main>
  </div>
</template>
