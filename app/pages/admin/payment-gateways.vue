<script setup lang="ts">
import type { PaymentProviderMeta } from '#shared/utils/payments'

interface Gateway { id: string, testOnly: boolean, provider: string, label: string, isActive: boolean, isSandbox: boolean, merchantId: string | null, baseUrl: string | null, orderPrefix: string | null, serverKeyMasked: string | null, clientKeyMasked: string | null, hasServerKey: boolean, hasClientKey: boolean, updatedAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Payment gateway' })

const toast = useToast()
const config = useRuntimeConfig()
const { confirm } = useConfirmDialog()
const data = ref<{ providers: PaymentProviderMeta[], items: Gateway[] } | null>(null)
const forms = reactive<Record<string, Record<string, string>>>({})
async function load() {
  data.value = await apiFetch('/api/admin/payment-gateways')
  for (const gateway of data.value!.items) forms[gateway.id] = { baseUrl: gateway.baseUrl ?? '', orderPrefix: gateway.orderPrefix ?? '', merchantId: gateway.merchantId ?? '', serverKey: '', clientKey: '' }
}
onMounted(load)
const meta = (provider: string) => data.value?.providers.find(p => p.value === provider)
const masked = (gateway: Gateway, key: string) => (key === 'serverKey' ? gateway.serverKeyMasked : key === 'clientKey' ? gateway.clientKeyMasked : null)

const saving = ref<string | null>(null)
async function save(gateway: Gateway, isActive?: boolean) {
  if (isActive === false && !await confirm({ title: 'Nonaktifkan gateway?', description: 'Kreator tidak bisa membayar sampai ada gateway aktif lagi.', color: 'error', confirmLabel: 'Nonaktifkan' })) return
  saving.value = gateway.id
  try {
    const form = forms[gateway.id]!
    data.value = await apiFetch(`/api/admin/payment-gateways/${gateway.id}`, {
      method: 'PATCH',
      body: { baseUrl: form.baseUrl, orderPrefix: form.orderPrefix, merchantId: form.merchantId || null, ...(form.serverKey && { serverKey: form.serverKey }), ...(form.clientKey && { clientKey: form.clientKey }), ...(isActive !== undefined && { isActive }) }
    })
    await load()
    toast.add({ title: isActive === true ? 'Gateway aktif. Kreator sudah bisa membayar.' : 'Gateway disimpan.', color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gateway gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = null
  }
}
const site = computed(() => config.public.siteUrl)
const registration = computed(() => [
  { label: 'Webhook', value: `${site.value}/api/webhooks/payments/nexadream_hub` },
  { label: 'Finish redirect', value: `${site.value}/app/billing?status=success` },
  { label: 'Error redirect', value: `${site.value}/app/billing?status=failed` },
  { label: 'Pending redirect', value: `${site.value}/app/billing?status=pending` }
])
</script>

<template>
  <div class="max-w-3xl">
    <CommandBar
      title="Payment gateway"
      description="Kunci gateway disimpan terenkripsi dan tidak pernah ditampilkan lagi. Hanya satu gateway aktif."
    />
    <div
      v-if="!data"
      class="space-y-4"
    >
      <USkeleton class="h-96 w-full" />
    </div>
    <div
      v-else
      class="space-y-6"
    >
      <UCard
        v-for="gateway in data.items"
        :key="gateway.id"
      >
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="flex gap-3">
              <UIcon
                :name="meta(gateway.provider)?.icon ?? 'i-lucide-credit-card'"
                class="size-6 text-primary shrink-0 mt-0.5"
              />
              <div>
                <p class="font-semibold text-highlighted">
                  {{ gateway.label }}
                </p>
                <p class="text-sm text-muted">
                  {{ meta(gateway.provider)?.description }}
                </p>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <UBadge
                :color="gateway.isActive ? 'success' : 'neutral'"
                variant="subtle"
                :label="gateway.isActive ? 'Aktif' : 'Nonaktif'"
                class="shrink-0"
              />
              <UBadge
                v-if="gateway.testOnly"
                color="warning"
                variant="subtle"
                label="Mode uji"
              />
            </div>
          </div>
        </template>
        <form
          class="space-y-4"
          @submit.prevent="save(gateway)"
        >
          <UFormField
            v-for="field in meta(gateway.provider)?.fields ?? []"
            :key="field.key"
            :label="field.label"
            :hint="field.secret && masked(gateway, field.key) ? `Tersimpan: ${masked(gateway, field.key)}` : undefined"
            :description="field.hint"
          >
            <UInput
              v-model="forms[gateway.id]![field.key]"
              :type="field.secret ? 'password' : 'text'"
              :placeholder="field.secret && masked(gateway, field.key) ? 'Kosongkan untuk tetap memakai yang tersimpan' : field.placeholder"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <div class="flex flex-wrap gap-2 justify-end">
            <UButton
              v-if="gateway.isActive"
              type="button"
              color="error"
              variant="ghost"
              label="Nonaktifkan"
              :disabled="saving === gateway.id"
              @click="save(gateway, false)"
            />
            <UButton
              type="submit"
              color="neutral"
              variant="outline"
              label="Simpan"
              :loading="saving === gateway.id"
            />
            <UButton
              v-if="!gateway.isActive"
              type="button"
              label="Simpan & aktifkan"
              icon="i-lucide-power"
              :loading="saving === gateway.id"
              @click="save(gateway, true)"
            />
          </div>
        </form>
      </UCard>
      <UCard>
        <template #header>
          <p class="font-semibold text-highlighted">
            Berikan ke admin Payment Hub
          </p>
          <p class="text-sm text-muted">
            Alamat ini didaftarkan di Payment Hub. Sebagai gantinya, minta kunci API platform dan prefiks nomor pesanan.
          </p>
        </template>
        <dl class="space-y-3 text-sm">
          <div
            v-for="item in registration"
            :key="item.label"
          >
            <dt class="text-muted">
              {{ item.label }}
            </dt>
            <dd class="font-mono text-xs break-all text-default">
              {{ item.value }}
            </dd>
          </div>
        </dl>
      </UCard>
    </div>
  </div>
</template>
