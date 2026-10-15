<script setup lang="ts">
interface Report {
  period: 'day' | 'week' | 'month'
  series: Record<string, number | string>[]
  totals: Record<string, number>
  averagePayment: number
  conversion: number
  revenueByPlan: { plan: string, period: string, revenue: number, payments: number }[]
  book: { mrr: number, paying: number, trialing: number, pastDue: number, rows: { plan: string, status: string, n: number, mrr: number }[] }
  historySince: string | null
  usage: { device: string, count: number }[]
}

definePageMeta({ layout: 'admin' })
useHead({ title: 'Laporan' })
const period = ref<'day' | 'week' | 'month'>('month')
const limit = computed(() => ({ day: 30, week: 12, month: 12 })[period.value])
const data = ref<Report | null>(null)
async function load() {
  data.value = await apiFetch<Report>('/api/admin/reports/summary', { query: { period: period.value, limit: limit.value } })
}
onMounted(load)
watch(period, load)
const COLUMNS: { key: string, label: string, money?: boolean }[] = [
  { key: 'revenue', label: 'Pendapatan', money: true }, { key: 'payments', label: 'Pembayaran' }, { key: 'newPaid', label: 'Pelanggan baru' }, { key: 'renewals', label: 'Perpanjangan' },
  { key: 'churned', label: 'Berhenti' }, { key: 'trialsLapsed', label: 'Uji coba habis' }, { key: 'signups', label: 'Pendaftar' }, { key: 'onboarded', label: 'Selesai panduan' },
  { key: 'posts', label: 'Postingan terbit' }, { key: 'dms', label: 'DM otomatis' }, { key: 'clicks', label: 'Klik link' }
]
const bucketLabel = (b: string) => new Intl.DateTimeFormat('id-ID', period.value === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).format(new Date(`${b}T12:00:00Z`))
const maxRevenue = computed(() => Math.max(1, ...(data.value?.series ?? []).map(r => Number(r.revenue))))
const DEVICE: Record<string, string> = { phone: 'HP', tablet: 'Tablet', desktop: 'Komputer' }
</script>

<template>
  <div class="space-y-6">
    <CommandBar
      title="Laporan"
      description="Angka gabungan seluruh platform, jam WIB."
    >
      <UTabs
        v-model="period"
        :items="[{ value: 'day', label: 'Harian' }, { value: 'week', label: 'Mingguan' }, { value: 'month', label: 'Bulanan' }]"
        :content="false"
      />
    </CommandBar>
    <USkeleton
      v-if="!data"
      class="h-96 w-full"
    />
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UCard>
          <p class="text-sm text-muted">
            MRR saat ini
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ formatIDR(data.book.mrr) }}
          </p>
          <p class="text-xs text-muted">
            tahunan dihitung ÷ 12
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Pelanggan berbayar
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ data.book.paying }}
          </p>
          <p class="text-xs text-muted">
            {{ data.book.trialing }} uji coba · {{ data.book.pastDue }} masa tenggang
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Pendapatan di rentang ini
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ formatIDR(data.totals.revenue ?? 0) }}
          </p>
          <p class="text-xs text-muted">
            rata-rata {{ formatIDR(data.averagePayment) }} per pembayaran
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Konversi pendaftar
          </p>
          <p class="text-2xl font-semibold text-highlighted">
            {{ data.conversion }}%
          </p>
          <p class="text-xs text-muted">
            pelanggan baru ÷ pendaftar di rentang ini
          </p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <p class="font-semibold text-highlighted">
            Pendapatan
          </p>
        </template>
        <div class="flex items-end gap-1 h-40">
          <div
            v-for="row in data.series"
            :key="String(row.bucket)"
            class="flex-1 min-w-0 h-full flex flex-col justify-end group relative"
          >
            <div
              class="w-full rounded-t bg-primary/80"
              :style="{ height: `${Math.max(Number(row.revenue) ? 3 : 1, (Number(row.revenue) / maxRevenue) * 100)}%`, opacity: Number(row.revenue) ? 1 : 0.25 }"
            />
            <span class="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-inverted text-inverted text-xs px-1.5 py-0.5 opacity-0 group-hover:opacity-100">{{ bucketLabel(String(row.bucket)) }} · {{ formatIDR(Number(row.revenue)) }}</span>
          </div>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted border-b border-default">
                <th class="px-3 py-2 font-medium sticky left-0 bg-default">
                  Periode
                </th>
                <th
                  v-for="c in COLUMNS"
                  :key="c.key"
                  class="px-3 py-2 font-medium text-right whitespace-nowrap"
                >
                  {{ c.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="row in [...data.series].reverse()"
                :key="String(row.bucket)"
              >
                <td class="px-3 py-2 whitespace-nowrap sticky left-0 bg-default">
                  {{ bucketLabel(String(row.bucket)) }}
                </td>
                <td
                  v-for="c in COLUMNS"
                  :key="c.key"
                  class="px-3 py-2 text-right tabular-nums"
                >
                  {{ c.money ? formatIDR(Number(row[c.key])) : row[c.key] }}
                </td>
              </tr>
              <tr class="font-semibold">
                <td class="px-3 py-2 sticky left-0 bg-default">
                  Total
                </td>
                <td
                  v-for="c in COLUMNS"
                  :key="c.key"
                  class="px-3 py-2 text-right tabular-nums"
                >
                  {{ c.money ? formatIDR(data.totals[c.key] ?? 0) : data.totals[c.key] ?? 0 }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <p
        v-if="data.historySince"
        class="text-xs text-muted"
      >
        Riwayat langganan tercatat sejak {{ formatDate(data.historySince) }}; angka berhenti sebelum tanggal itu tidak diketahui (bukan nol).
      </p>

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard>
          <template #header>
            <p class="font-semibold text-highlighted">
              Pendapatan per paket
            </p>
          </template>
          <p
            v-if="!data.revenueByPlan.length"
            class="text-sm text-muted"
          >
            Belum ada.
          </p>
          <p
            v-for="r in data.revenueByPlan"
            :key="`${r.plan}${r.period}`"
            class="flex justify-between text-sm py-0.5"
          >
            <span class="text-muted">{{ r.plan }} · {{ PERIOD_LABEL[r.period] ?? r.period }}</span><span>{{ formatIDR(r.revenue) }} ({{ r.payments }})</span>
          </p>
        </UCard>
        <UCard>
          <template #header>
            <p class="font-semibold text-highlighted">
              Posisi pelanggan
            </p>
          </template>
          <p
            v-for="r in data.book.rows"
            :key="`${r.plan}${r.status}`"
            class="flex justify-between text-sm py-0.5"
          >
            <span class="text-muted">{{ r.plan }} · {{ statusOf(SUBSCRIPTION_STATUS, r.status).label }}</span><span>{{ r.n }}</span>
          </p>
        </UCard>
        <UCard>
          <template #header>
            <p class="font-semibold text-highlighted">
              Pemakaian (perangkat-hari)
            </p>
          </template>
          <p
            v-if="!data.usage.length"
            class="text-sm text-muted"
          >
            Belum ada data.
          </p>
          <p
            v-for="u in data.usage"
            :key="u.device"
            class="flex justify-between text-sm py-0.5"
          >
            <span class="text-muted">{{ DEVICE[u.device] ?? u.device }}</span><span>{{ u.count }}</span>
          </p>
        </UCard>
      </div>
    </template>
  </div>
</template>
