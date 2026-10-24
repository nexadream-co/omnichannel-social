<script setup lang="ts">
interface Dashboard {
  workspaces: { total: number, active: number, suspended: number, newThisMonth: number }
  subscriptionsByStatus: { status: string, n: number }[]
  revenueThisMonth: { amount: number, n: number }
  unreadMessages: number
  newestWorkspaces: { id: string, name: string, status: string, createdAt: string, planName: string, subscriptionStatus: string }[]
  latestPayments: { id: string, orderId: string, amount: number, status: string, createdAt: string, workspaceName: string }[]
  signupsByMonth: { month: string, n: number }[]
  health: {
    ok: boolean
    tickAgeSeconds: number | null
    oldestDueJobSeconds: number | null
    mediaProcessorAgeSeconds: number | null
    publishing: { platform: string, published: number, failed: number }[]
    needsReauth: number
    dmsToday: number
    metaBacklog: number
    queues: { queue: string, n: number }[]
    deadJobs: number
  }
}

definePageMeta({ layout: 'admin' })
useHead({ title: 'Dasbor' })

const auth = useStaffAuth()
const data = ref<Dashboard | null>(null)
onMounted(async () => {
  data.value = await apiFetch<Dashboard>('/api/admin/dashboard')
})
const ago = (seconds: number | null) => (seconds === null ? 'belum pernah' : formatRelative(new Date(Date.now() - seconds * 1000), 'id'))
// A media processor that has not reported for 30 minutes is worth a look, after a day it is down. Client-side only: /healthz `ok` feeds host health checks.
const mediaStale = computed(() => (data.value?.health.mediaProcessorAgeSeconds ?? 0) > 1800)
const mediaClass = computed(() => {
  const age = data.value?.health.mediaProcessorAgeSeconds ?? 0
  return age > 86_400 ? 'text-error font-medium' : age > 1800 ? 'text-warning font-medium' : 'text-default'
})
const rate = (p: { published: number, failed: number }) => (p.published + p.failed ? `${Math.round((p.published / (p.published + p.failed)) * 100)}%` : '—')
const maxSignup = computed(() => Math.max(1, ...(data.value?.signupsByMonth ?? []).map(s => s.n)))
const monthLabel = (m: string) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(`${m}-15T00:00:00Z`))
</script>

<template>
  <div class="space-y-6">
    <CommandBar
      title="Dasbor"
      :description="`Halo, ${auth.profile.value?.user.name ?? ''}. Ringkasan platform hari ini.`"
    />
    <div
      v-if="!data"
      class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <USkeleton
        v-for="n in 8"
        :key="n"
        class="h-24 w-full"
      />
    </div>
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UCard>
          <p class="text-sm text-muted">
            Ruang kerja
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ data.workspaces.total }}
          </p>
          <p class="text-xs text-muted">
            {{ data.workspaces.active }} aktif · {{ data.workspaces.suspended }} ditangguhkan · +{{ data.workspaces.newThisMonth }} bulan ini
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Pendapatan bulan ini
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ formatIDR(data.revenueThisMonth.amount) }}
          </p>
          <p class="text-xs text-muted">
            {{ data.revenueThisMonth.n }} pembayaran lunas
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Langganan
          </p>
          <div class="flex flex-wrap gap-1 mt-1">
            <UBadge
              v-for="s in data.subscriptionsByStatus"
              :key="s.status"
              color="neutral"
              variant="subtle"
              :label="`${statusOf(SUBSCRIPTION_STATUS, s.status).label}: ${s.n}`"
            />
          </div>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Pesan masuk belum dibaca
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ data.unreadMessages }}
          </p>
          <NuxtLink
            to="/admin/messages"
            class="text-xs text-primary"
          >
            Buka pesan masuk
          </NuxtLink>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <p class="font-semibold text-highlighted">
              Kesehatan platform
            </p>
            <UBadge
              :color="!data.health.ok ? 'error' : mediaStale ? 'warning' : 'success'"
              variant="subtle"
              :label="data.health.ok && !mediaStale ? 'Sehat' : 'Perlu dicek'"
            />
          </div>
        </template>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <div>
            <p class="text-muted">
              Publikasi 24 jam
            </p>
            <p
              v-for="p in data.health.publishing"
              :key="p.platform"
              class="text-default"
            >
              {{ PLATFORM_LABEL[p.platform] ?? p.platform }}: {{ p.published }} terbit · {{ p.failed }} gagal ({{ rate(p) }})
            </p>
            <p
              v-if="!data.health.publishing.length"
              class="text-default"
            >
              Belum ada
            </p>
          </div>
          <div>
            <p class="text-muted">
              Akun perlu dihubungkan ulang
            </p>
            <NuxtLink
              to="/admin/social-accounts"
              class="text-default font-medium"
            >
              {{ data.health.needsReauth }}
            </NuxtLink>
            <p class="text-muted mt-2">
              DM otomatis 24 jam
            </p>
            <p class="text-default font-medium">
              {{ data.health.dmsToday }}
            </p>
          </div>
          <div>
            <p class="text-muted">
              Tick terakhir
            </p>
            <p class="text-default">
              {{ ago(data.health.tickAgeSeconds) }}
            </p>
            <p class="text-muted mt-2">
              Media processor
            </p>
            <p :class="mediaClass">
              {{ ago(data.health.mediaProcessorAgeSeconds) }}
            </p>
          </div>
          <div>
            <p class="text-muted">
              Antrean
            </p>
            <p class="text-default">
              {{ data.health.queues.reduce((s, q) => s + q.n, 0) }} menunggu · {{ data.health.deadJobs }} gagal
            </p>
            <p class="text-muted mt-2">
              Meta webhook belum diproses
            </p>
            <p class="text-default">
              {{ data.health.metaBacklog }}
            </p>
            <NuxtLink
              to="/admin/system/jobs"
              class="text-xs text-primary"
            >
              Lihat antrean pekerjaan
            </NuxtLink>
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard class="lg:col-span-1">
          <template #header>
            <p class="font-semibold text-highlighted">
              Pendaftar per bulan
            </p>
          </template>
          <div class="flex items-end gap-2 h-32">
            <div
              v-for="s in data.signupsByMonth"
              :key="s.month"
              class="flex-1 flex flex-col items-center justify-end h-full gap-1"
            >
              <span class="text-xs text-muted">{{ s.n }}</span>
              <div
                class="w-full rounded-t bg-primary/80"
                :style="{ height: `${(s.n / maxSignup) * 80}%` }"
              />
              <span class="text-xs text-muted">{{ monthLabel(s.month) }}</span>
            </div>
          </div>
        </UCard>
        <UCard>
          <template #header>
            <p class="font-semibold text-highlighted">
              Ruang kerja terbaru
            </p>
          </template>
          <ul class="space-y-2 text-sm">
            <li
              v-for="w in data.newestWorkspaces"
              :key="w.id"
              class="flex justify-between gap-2"
            >
              <NuxtLink
                :to="`/admin/workspaces/${w.id}`"
                class="text-default hover:text-primary truncate"
              >
                {{ w.name }}
              </NuxtLink>
              <span class="text-muted shrink-0">{{ w.planName }} · {{ statusOf(SUBSCRIPTION_STATUS, w.subscriptionStatus).label }}</span>
            </li>
          </ul>
        </UCard>
        <UCard>
          <template #header>
            <p class="font-semibold text-highlighted">
              Pembayaran terbaru (30 hari)
            </p>
          </template>
          <p
            v-if="!data.latestPayments.length"
            class="text-sm text-muted"
          >
            Belum ada pembayaran.
          </p>
          <ul class="space-y-2 text-sm">
            <li
              v-for="p in data.latestPayments"
              :key="p.id"
              class="flex justify-between gap-2"
            >
              <span class="text-default truncate">{{ p.workspaceName }}</span>
              <span class="text-muted shrink-0">{{ formatIDR(p.amount) }} · {{ statusOf(PAYMENT_STATUS, p.status).label }}</span>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </div>
</template>
