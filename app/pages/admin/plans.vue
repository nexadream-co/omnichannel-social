<script setup lang="ts">
import { FEATURE_KEYS, FEATURE_META, LIMIT_KEYS, LIMIT_META, formatLimit, type FeatureKey, type LimitKey } from '#shared/utils/plans'

interface Plan {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  trialDays: number
  isActive: boolean
  isPublic: boolean
  order: number
  limits: Record<LimitKey, number>
  features: Record<FeatureKey, boolean>
  subscriberCount: number
  deletable: boolean
}
type PlanForm = Omit<Plan, 'id' | 'subscriberCount' | 'deletable' | 'description'> & { description: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Paket' })

const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('plans.write'))
const items = ref<Plan[]>([])
const loading = ref(true)

async function load() {
  items.value = (await apiFetch<{ items: Plan[] }>('/api/admin/plans')).items
  loading.value = false
}
onMounted(load)

const blank = (): PlanForm => ({
  slug: '', name: '', description: '', priceMonthly: 0, priceYearly: 0, trialDays: 0, isActive: false, isPublic: false, order: items.value.length,
  limits: Object.fromEntries(LIMIT_KEYS.map(k => [k, 0])) as Record<LimitKey, number>,
  features: Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) as Record<FeatureKey, boolean>
})
const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive(blank())
const saving = ref(false)

function edit(plan: Plan | null) {
  editingId.value = plan?.id ?? null
  Object.assign(form, plan ? { ...structuredClone(toRaw(plan)), description: plan.description ?? '' } : blank())
  open.value = true
}

function toggleUnlimited(key: LimitKey, unlimited: boolean) {
  form.limits[key] = unlimited ? -1 : 0
}

async function save() {
  saving.value = true
  try {
    const body = { slug: form.slug, name: form.name, description: form.description || null, priceMonthly: Number(form.priceMonthly), priceYearly: Number(form.priceYearly), trialDays: Number(form.trialDays), isActive: form.isActive, isPublic: form.isPublic, order: Number(form.order), limits: form.limits, features: form.features }
    if (editingId.value) await apiFetch(`/api/admin/plans/${editingId.value}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/plans', { method: 'POST', body })
    toast.add({ title: 'Paket disimpan. Berlaku untuk semua ruang kerja dalam satu menit.', color: 'success' })
    open.value = false
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Paket gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(plan: Plan) {
  if (!(await confirm({ title: `Hapus paket ${plan.name}?`, description: 'Paket yang masih dipakai tidak bisa dihapus; nonaktifkan saja.', color: 'error', confirmLabel: 'Hapus' }))) return
  try {
    await apiFetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Paket gagal dihapus.'), color: 'error' })
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Paket"
      description="Harga, batas dan fitur setiap paket. Perubahan berlaku tanpa deploy."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Paket baru"
        @click="edit(null)"
      />
    </CommandBar>
    <div
      v-if="loading"
      class="grid gap-4 md:grid-cols-3"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-72 w-full"
      />
    </div>
    <div
      v-else
      class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <UCard
        v-for="plan in items"
        :key="plan.id"
      >
        <template #header>
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold text-highlighted">
                {{ plan.name }}
              </p>
              <p class="text-sm text-muted">
                {{ formatIDR(plan.priceMonthly) }} / bulan · {{ formatIDR(plan.priceYearly) }} / tahun
              </p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <UBadge
                :color="plan.isActive ? 'success' : 'neutral'"
                variant="subtle"
                :label="plan.isActive ? 'Bisa dibeli' : 'Nonaktif'"
              />
              <UBadge
                v-if="!plan.isPublic"
                color="neutral"
                variant="outline"
                label="Tersembunyi"
              />
            </div>
          </div>
        </template>
        <dl class="text-sm space-y-1.5">
          <div
            v-for="key in LIMIT_KEYS"
            :key="key"
            class="flex justify-between gap-2"
          >
            <dt class="text-muted">
              {{ LIMIT_META[key].label }}
            </dt>
            <dd class="font-medium text-right">
              {{ formatLimit(key, plan.limits[key]) }}
            </dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-1 mt-3">
          <UBadge
            v-for="key in FEATURE_KEYS.filter(k => plan.features[k])"
            :key="key"
            color="primary"
            variant="soft"
            size="sm"
            :label="FEATURE_META[key].label"
          />
        </div>
        <template #footer>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted">{{ plan.subscriberCount }} ruang kerja · uji coba {{ plan.trialDays }} hari</span>
            <div
              v-if="canWrite"
              class="flex gap-1"
            >
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                aria-label="Ubah"
                @click="edit(plan)"
              />
              <UButton
                v-if="plan.deletable"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                aria-label="Hapus"
                @click="remove(plan)"
              />
            </div>
          </div>
        </template>
      </UCard>
    </div>

    <FormSlideover
      v-model:open="open"
      :title="editingId ? `Ubah paket ${form.name}` : 'Paket baru'"
      :loading="saving"
      wide
      @submit="save"
    >
      <div class="space-y-5">
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            label="Nama"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Slug"
            description="Huruf kecil, untuk tautan dan laporan."
          >
            <UInput
              v-model="form.slug"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Harga bulanan (Rp)">
            <UInputNumber
              v-model="form.priceMonthly"
              :min="0"
              :step="1000"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Harga tahunan (Rp)">
            <UInputNumber
              v-model="form.priceYearly"
              :min="0"
              :step="1000"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Uji coba (hari)">
            <UInputNumber
              v-model="form.trialDays"
              :min="0"
              :max="90"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Urutan">
            <UInputNumber
              v-model="form.order"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField label="Deskripsi">
          <UTextarea
            v-model="form.description"
            :rows="2"
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-wrap gap-6">
          <USwitch
            v-model="form.isActive"
            label="Bisa dibeli"
          />
          <USwitch
            v-model="form.isPublic"
            label="Tampil di halaman harga"
          />
        </div>
        <USeparator label="Batas" />
        <div class="space-y-3">
          <div
            v-for="key in LIMIT_KEYS"
            :key="key"
            class="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_10rem_auto] gap-3 items-center"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ LIMIT_META[key].label }}
              </p>
              <p
                v-if="LIMIT_META[key].hint"
                class="text-xs text-muted"
              >
                {{ LIMIT_META[key].hint }}
              </p>
            </div>
            <UInputNumber
              v-model="form.limits[key]"
              :min="-1"
              :disabled="form.limits[key] === -1"
              class="w-full col-span-2 sm:col-span-1 order-last sm:order-none"
            />
            <UCheckbox
              :model-value="form.limits[key] === -1"
              label="Tanpa batas"
              @update:model-value="(v: boolean | 'indeterminate') => toggleUnlimited(key, v === true)"
            />
          </div>
        </div>
        <USeparator label="Fitur" />
        <div class="space-y-3">
          <USwitch
            v-for="key in FEATURE_KEYS"
            :key="key"
            v-model="form.features[key]"
            :label="FEATURE_META[key].label"
            :description="FEATURE_META[key].hint || undefined"
          />
        </div>
      </div>
    </FormSlideover>
  </div>
</template>
