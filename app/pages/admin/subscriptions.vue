<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, workspaceId: string, workspaceName: string, status: string, period: string, planSlug: string, planName: string, trialEndsAt: string | null, currentPeriodEnd: string | null, graceEndsAt: string | null, cancelledAt: string | null, updatedAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Langganan' })

const STATUS_LABEL: Record<string, string> = { trialing: 'Uji coba', active: 'Aktif', past_due: 'Masa tenggang', cancelled: 'Dibatalkan', downgraded: 'Gratis', suspended: 'Ditangguhkan' }
const STATUS_COLOR: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'error'> = { active: 'success', trialing: 'info', past_due: 'warning', cancelled: 'neutral', downgraded: 'neutral', suspended: 'error' }
const status = ref('all')
const plan = ref('all')
const filters = computed(() => ({ status: status.value, plan: plan.value }))
const list = useServerList<Row>('/api/admin/subscriptions', { filters, limit: 25 })
onMounted(list.refresh)
const statusItems = [{ value: 'all', label: 'Semua status' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]
const planItems = computed(() => [{ value: 'all', label: 'Semua paket' }, ...((list.extra.value.plans as { slug: string, name: string }[] | undefined) ?? []).map(p => ({ value: p.slug, label: p.name }))])

const columns: TableColumn<Row>[] = [
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'planName', header: 'Paket' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'dates', header: 'Tanggal penting' },
  { accessorKey: 'updatedAt', header: 'Diubah' }
]
const dates = (row: Row) => [
  row.trialEndsAt && `Uji coba sampai ${formatDate(row.trialEndsAt)}`,
  row.currentPeriodEnd && `Periode sampai ${formatDate(row.currentPeriodEnd)}`,
  row.graceEndsAt && `Tenggang sampai ${formatDate(row.graceEndsAt)}`
].filter(Boolean) as string[]
</script>

<template>
  <div>
    <CommandBar
      title="Langganan"
      description="Status langganan setiap ruang kerja, beserta tanggal uji coba, periode dan masa tenggang."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari ruang kerja"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-44"
      />
      <USelect
        v-model="plan"
        :items="planItems"
        class="w-40"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada langganan."
      >
        <template #planName-cell="{ row }">
          {{ row.original.planName }} <span class="text-muted">· {{ row.original.period === 'yearly' ? 'tahunan' : 'bulanan' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="STATUS_COLOR[row.original.status] ?? 'neutral'"
            variant="subtle"
            :label="STATUS_LABEL[row.original.status] ?? row.original.status"
          />
        </template>
        <template #dates-cell="{ row }">
          <div class="text-xs text-muted space-y-0.5">
            <p
              v-for="line in dates(row.original)"
              :key="line"
            >
              {{ line }}
            </p>
            <p v-if="!dates(row.original).length">
              —
            </p>
          </div>
        </template>
        <template #updatedAt-cell="{ row }">
          <span class="whitespace-nowrap">{{ formatDateTime(row.original.updatedAt) }}</span>
        </template>
      </AdminTable>
    </UCard>
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center mt-4"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
      />
    </div>
  </div>
</template>
