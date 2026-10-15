<script setup lang="ts">
import { LIMIT_KEYS, LIMIT_META, formatLimit } from '#shared/utils/plans'

interface Detail {
  workspace: { id: string, name: string, slug: string, timezone: string, status: string, suspendedAt: string | null, suspendedReason: string | null, createdAt: string, onboardingCompletedAt: string | null, niche: string | null, deleteRequestedAt: string | null }
  subscription: { status: string, period: string, trialEndsAt: string | null, currentPeriodEnd: string | null, graceEndsAt: string | null, cancelledAt: string | null, planSlug: string, planName: string } | null
  entitlements: { effectivePlanSlug: string, limits: Record<string, number>, usage: Record<string, number> }
  members: { id: string, name: string, email: string, phone: string | null, role: string, isActive: boolean, lastLoginAt: string | null, lastSeenAt: string | null }[]
  payments: { id: string, orderId: string, amount: number, status: string, planSlug: string | null, period: string, createdAt: string }[]
  deleteRequest: { actorName: string | null, createdAt: string, metadata: { reason?: string } | null } | null
  plans: { slug: string, name: string }[]
  drillDown: {
    accounts: { id: string, platform: string, username: string | null, status: string, tokenExpiresAt: string | null }[]
    targets: { id: string, platform: string, format: string, status: string, scheduledAt: string | null, lastErrorCode: string | null, updatedAt: string }[]
    linkCount: number
    bio: { id: string, handle: string, published: boolean }[]
    ruleCount: number
  }
}

definePageMeta({ layout: 'admin' })
const route = useRoute()
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const id = String(route.params.id)
const data = ref<Detail | null>(null)
useHead({ title: () => data.value?.workspace.name ?? 'Ruang kerja' })
async function load() {
  data.value = await apiFetch<Detail>(`/api/admin/workspaces/${id}`)
}
onMounted(load)

const can = (key: string) => auth.hasPermission(key)
const isSuper = computed(() => Boolean(auth.profile.value?.user.role.isSuperAdmin))
const busy = ref<string | null>(null)
async function act(name: string, run: () => Promise<unknown>, success: string) {
  busy.value = name
  try {
    await run()
    toast.add({ title: success, color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
  } finally {
    busy.value = null
  }
}

const suspendOpen = ref(false)
const suspendReason = ref('')
const suspend = () => act('suspend', () => apiFetch(`/api/admin/workspaces/${id}/suspend`, { method: 'POST', body: { reason: suspendReason.value } }), 'Ruang kerja ditangguhkan.').then(() => {
  suspendOpen.value = false
})
async function reinstate() {
  if (!await confirm({ title: 'Pulihkan ruang kerja?', description: 'Postingan yang jadwalnya terlewat saat ditangguhkan akan ditandai gagal, tidak diterbitkan terlambat.', confirmLabel: 'Pulihkan' })) return
  await act('reinstate', () => apiFetch(`/api/admin/workspaces/${id}/reinstate`, { method: 'POST' }), 'Ruang kerja dipulihkan.')
}

const planOpen = ref(false)
const planForm = reactive({ planSlug: '', period: 'monthly', status: 'active', currentPeriodEnd: '', note: '' })
function openPlan() {
  const s = data.value!.subscription
  Object.assign(planForm, { planSlug: s?.planSlug ?? '', period: s?.period ?? 'monthly', status: s?.status === 'suspended' ? 'active' : s?.status ?? 'active', currentPeriodEnd: s?.currentPeriodEnd?.slice(0, 10) ?? '', note: '' })
  planOpen.value = true
}
const savePlan = () => act('plan', () => apiFetch(`/api/admin/workspaces/${id}/plan`, {
  method: 'POST',
  body: { planSlug: planForm.planSlug, period: planForm.period, status: planForm.status, currentPeriodEnd: planForm.currentPeriodEnd ? new Date(`${planForm.currentPeriodEnd}T23:59:00+07:00`).toISOString() : null, note: planForm.note || undefined }
}), 'Paket diubah.').then(() => {
  planOpen.value = false
})

async function remove() {
  if (!await confirm({ title: `Hapus ${data.value!.workspace.name}?`, description: 'Akun sosial diputus, pekerjaan dibatalkan dan pemilik diberi tahu. Data dihapus permanen setelah masa retensi.', color: 'error', confirmLabel: 'Hapus' })) return
  await act('delete', () => apiFetch(`/api/admin/workspaces/${id}`, { method: 'DELETE' }), 'Ruang kerja dihapus.')
  await navigateTo('/admin/workspaces')
}
async function impersonate() {
  if (!await confirm({ title: 'Menyamar sebagai pemilik?', description: 'Konsol kreator terbuka sebagai pemilik selama 1 jam. Pembayaran tidak bisa dilakukan dan semua tindakan tercatat.', confirmLabel: 'Impersonate' })) return
  busy.value = 'impersonate'
  try {
    const result = await apiFetch<{ redirect: string }>(`/api/admin/workspaces/${id}/impersonate`, { method: 'POST' })
    window.location.href = result.redirect
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
    busy.value = null
  }
}
const statusItems = Object.entries(SUBSCRIPTION_STATUS).filter(([k]) => k !== 'suspended').map(([value, s]) => ({ value, label: s.label }))
const SHOWN_LIMITS = LIMIT_KEYS.filter(k => k !== 'activityLogRetentionDays')
</script>

<template>
  <div
    v-if="!data"
    class="space-y-4"
  >
    <USkeleton class="h-10 w-64" />
    <USkeleton class="h-64 w-full" />
  </div>
  <div
    v-else
    class="space-y-6"
  >
    <CommandBar
      :title="data.workspace.name"
      :description="`${data.workspace.slug} · daftar ${formatDate(data.workspace.createdAt)} · ${data.workspace.timezone}`"
    >
      <UButton
        v-if="isSuper"
        icon="i-lucide-user-round-cog"
        color="neutral"
        variant="outline"
        label="Impersonate"
        :loading="busy === 'impersonate'"
        @click="impersonate"
      />
      <UButton
        v-if="can('subscriptions.write')"
        icon="i-lucide-layers"
        color="neutral"
        variant="outline"
        label="Ubah paket"
        @click="openPlan"
      />
      <UButton
        v-if="can('workspaces.write') && data.workspace.status === 'active'"
        icon="i-lucide-ban"
        color="error"
        variant="soft"
        label="Tangguhkan"
        @click="suspendReason = ''; suspendOpen = true"
      />
      <UButton
        v-if="can('workspaces.write') && data.workspace.status === 'suspended'"
        icon="i-lucide-rotate-ccw"
        label="Pulihkan"
        :loading="busy === 'reinstate'"
        @click="reinstate"
      />
      <UButton
        v-if="isSuper"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        label="Hapus"
        :loading="busy === 'delete'"
        @click="remove"
      />
    </CommandBar>

    <UAlert
      v-if="data.workspace.status === 'suspended'"
      color="error"
      variant="subtle"
      icon="i-lucide-ban"
      :title="`Ditangguhkan sejak ${formatDateTime(data.workspace.suspendedAt)}`"
      :description="data.workspace.suspendedReason ?? ''"
    />
    <UAlert
      v-if="data.deleteRequest"
      color="warning"
      variant="subtle"
      icon="i-lucide-trash"
      :title="`Pemilik minta akun dihapus (${formatDateTime(data.deleteRequest.createdAt)})`"
      :description="data.deleteRequest.metadata?.reason ? `Alasan: ${data.deleteRequest.metadata.reason}` : 'Tanpa alasan.'"
    />

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard>
        <template #header>
          <p class="font-semibold text-highlighted">
            Langganan
          </p>
        </template>
        <dl
          v-if="data.subscription"
          class="space-y-2 text-sm"
        >
          <div class="flex justify-between gap-2">
            <dt class="text-muted">
              Paket
            </dt><dd class="text-default">
              {{ data.subscription.planName }} · {{ PERIOD_LABEL[data.subscription.period] }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">
              Status
            </dt><dd>
              <UBadge
                size="sm"
                variant="subtle"
                :color="statusOf(SUBSCRIPTION_STATUS, data.subscription.status).color"
                :label="statusOf(SUBSCRIPTION_STATUS, data.subscription.status).label"
              />
            </dd>
          </div>
          <div
            v-if="data.subscription.trialEndsAt"
            class="flex justify-between gap-2"
          >
            <dt class="text-muted">
              Uji coba sampai
            </dt><dd>{{ formatDate(data.subscription.trialEndsAt) }}</dd>
          </div>
          <div
            v-if="data.subscription.currentPeriodEnd"
            class="flex justify-between gap-2"
          >
            <dt class="text-muted">
              Periode sampai
            </dt><dd>{{ formatDate(data.subscription.currentPeriodEnd) }}</dd>
          </div>
          <div
            v-if="data.subscription.graceEndsAt"
            class="flex justify-between gap-2"
          >
            <dt class="text-muted">
              Tenggang sampai
            </dt><dd>{{ formatDate(data.subscription.graceEndsAt) }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">
              Paket berlaku
            </dt><dd>{{ data.plans.find(p => p.slug === data!.entitlements.effectivePlanSlug)?.name ?? data.entitlements.effectivePlanSlug }}</dd>
          </div>
        </dl>
      </UCard>
      <UCard class="lg:col-span-2">
        <template #header>
          <p class="font-semibold text-highlighted">
            Pemakaian vs batas paket
          </p>
        </template>
        <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <div
            v-for="key in SHOWN_LIMITS"
            :key="key"
            class="flex justify-between gap-2"
          >
            <span class="text-muted">{{ LIMIT_META[key].label }}</span>
            <span class="text-default">{{ key in data.entitlements.usage ? `${data.entitlements.usage[key]} / ` : '' }}{{ formatLimit(key, data.entitlements.limits[key] ?? 0) }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <p class="font-semibold text-highlighted">
          Anggota
        </p>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="m in data.members"
          :key="m.id"
          class="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <span class="font-medium text-highlighted">{{ m.name }}</span>
          <span class="text-muted">{{ m.email }}{{ m.phone ? ` · ${m.phone}` : '' }}</span>
          <UBadge
            size="sm"
            color="neutral"
            variant="subtle"
            :label="MEMBER_ROLE[m.role] ?? m.role"
          />
          <UBadge
            v-if="!m.isActive"
            size="sm"
            color="neutral"
            variant="outline"
            label="Nonaktif"
          />
          <span class="text-xs text-muted ml-auto">Masuk terakhir {{ m.lastLoginAt ? formatDateTime(m.lastLoginAt) : '—' }}</span>
        </li>
      </ul>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <p class="font-semibold text-highlighted">
            Akun sosial
          </p>
        </template>
        <p
          v-if="!data.drillDown.accounts.length"
          class="p-4 text-sm text-muted"
        >
          Belum ada.
        </p>
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="a in data.drillDown.accounts"
            :key="a.id"
            class="px-4 py-2.5 flex items-center gap-3"
          >
            <span class="w-20 text-muted">{{ PLATFORM_LABEL[a.platform] }}</span>
            <span class="flex-1 truncate">{{ a.username ?? '—' }}</span>
            <UBadge
              size="sm"
              variant="subtle"
              :color="statusOf(ACCOUNT_STATUS, a.status).color"
              :label="statusOf(ACCOUNT_STATUS, a.status).label"
            />
            <span class="text-xs text-muted whitespace-nowrap">{{ a.tokenExpiresAt ? `token ${formatDate(a.tokenExpiresAt)}` : '' }}</span>
          </li>
        </ul>
      </UCard>
      <UCard>
        <template #header>
          <p class="font-semibold text-highlighted">
            Ringkasan fitur
          </p>
        </template>
        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt class="text-muted">
              Link produk
            </dt><dd class="text-default font-medium">
              {{ data.drillDown.linkCount }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Aturan Balas Otomatis
            </dt><dd class="text-default font-medium">
              {{ data.drillDown.ruleCount }}
            </dd>
          </div>
          <div
            v-for="b in data.drillDown.bio"
            :key="b.id"
            class="col-span-2"
          >
            <dt class="text-muted">
              Etalase
            </dt><dd class="text-default">
              @{{ b.handle }} · {{ b.published ? 'terbit' : 'belum terbit' }}
            </dd>
          </div>
        </dl>
      </UCard>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <p class="font-semibold text-highlighted">
          20 target postingan terakhir
        </p>
      </template>
      <p
        v-if="!data.drillDown.targets.length"
        class="p-4 text-sm text-muted"
      >
        Belum ada postingan.
      </p>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="t in data.drillDown.targets"
          :key="t.id"
          class="px-4 py-2.5 flex flex-wrap items-center gap-3"
        >
          <span class="w-20 text-muted">{{ PLATFORM_LABEL[t.platform] }}</span>
          <span class="text-muted">{{ t.format }}</span>
          <UBadge
            size="sm"
            variant="subtle"
            :color="statusOf(TARGET_STATUS, t.status).color"
            :label="statusOf(TARGET_STATUS, t.status).label"
          />
          <code
            v-if="t.lastErrorCode"
            class="text-xs text-error"
          >{{ t.lastErrorCode }}</code>
          <span class="text-xs text-muted ml-auto">{{ t.scheduledAt ? formatDateTime(t.scheduledAt) : formatDateTime(t.updatedAt) }}</span>
        </li>
      </ul>
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <p class="font-semibold text-highlighted">
          10 pembayaran terakhir
        </p>
      </template>
      <p
        v-if="!data.payments.length"
        class="p-4 text-sm text-muted"
      >
        Belum ada pembayaran.
      </p>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="p in data.payments"
          :key="p.id"
          class="px-4 py-2.5 flex flex-wrap items-center gap-3"
        >
          <code class="text-xs">{{ p.orderId }}</code>
          <span>{{ p.planSlug }} · {{ PERIOD_LABEL[p.period] }}</span>
          <span class="font-medium">{{ formatIDR(p.amount) }}</span>
          <UBadge
            size="sm"
            variant="subtle"
            :color="statusOf(PAYMENT_STATUS, p.status).color"
            :label="statusOf(PAYMENT_STATUS, p.status).label"
          />
          <span class="text-xs text-muted ml-auto">{{ formatDateTime(p.createdAt) }}</span>
        </li>
      </ul>
    </UCard>

    <FormSlideover
      v-model:open="suspendOpen"
      title="Tangguhkan ruang kerja"
      description="Publikasi dan Balas Otomatis berhenti. Link pendek dan Etalase tetap jalan."
      :loading="busy === 'suspend'"
      submit-label="Tangguhkan"
      @submit="suspend"
    >
      <UFormField
        label="Alasan"
        description="Dikirim ke pemilik akun."
        required
      >
        <UTextarea
          v-model="suspendReason"
          :rows="4"
          class="w-full"
        />
      </UFormField>
    </FormSlideover>
    <FormSlideover
      v-model:open="planOpen"
      title="Ubah paket"
      description="Melewati aturan perubahan biasa (paket gratis/negosiasi). Tercatat di riwayat langganan."
      :loading="busy === 'plan'"
      submit-label="Simpan paket"
      @submit="savePlan"
    >
      <div class="space-y-4">
        <UFormField label="Paket">
          <USelect
            v-model="planForm.planSlug"
            :items="data.plans.map(p => ({ value: p.slug, label: p.name }))"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Periode">
          <USelect
            v-model="planForm.period"
            :items="[{ value: 'monthly', label: 'Bulanan' }, { value: 'yearly', label: 'Tahunan' }]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Status">
          <USelect
            v-model="planForm.status"
            :items="statusItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Berlaku sampai (opsional)"
          description="Untuk uji coba: akhir uji coba. Untuk aktif: akhir periode."
        >
          <UInput
            v-model="planForm.currentPeriodEnd"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Catatan">
          <UTextarea
            v-model="planForm.note"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </FormSlideover>
  </div>
</template>
