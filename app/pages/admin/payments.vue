<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { PAYMENT_STATUSES } from '#shared/utils/payments'

interface Row { id: string, orderId: string, gatewayOrderId: string | null, provider: string, amount: number, status: string, rawStatus: string | null, paymentType: string | null, planSlug: string | null, period: string, paidAt: string | null, createdAt: string, workspaceName: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pembayaran' })

const STATUS_LABEL: Record<string, string> = { pending: 'Menunggu', paid: 'Lunas', failed: 'Gagal', expired: 'Kedaluwarsa', refunded: 'Dikembalikan', cancelled: 'Dibatalkan', challenge: 'Diperiksa' }
const STATUS_COLOR: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'error'> = { paid: 'success', pending: 'info', challenge: 'warning', refunded: 'warning', failed: 'error', expired: 'neutral', cancelled: 'neutral' }
const status = ref('all')
const filters = computed(() => ({ status: status.value }))
const list = useServerList<Row>('/api/admin/payments', { filters, limit: 25 })
onMounted(list.refresh)
const statusItems = [{ value: 'all', label: 'Semua status' }, ...PAYMENT_STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s]! }))]

const columns: TableColumn<Row>[] = [
  { accessorKey: 'createdAt', header: 'Waktu' },
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'orderId', header: 'Nomor pesanan' },
  { accessorKey: 'planSlug', header: 'Paket' },
  { accessorKey: 'amount', header: 'Jumlah' },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <div>
    <CommandBar
      title="Pembayaran"
      description="Semua pembayaran langganan, dengan nomor pesanan kita dan nomor di gateway."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nomor pesanan atau ruang kerja"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-44"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada pembayaran."
      >
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #orderId-cell="{ row }">
          <div class="font-mono text-xs">
            <p>{{ row.original.orderId }}</p>
            <p class="text-muted">
              {{ row.original.gatewayOrderId ?? '—' }}
            </p>
          </div>
        </template>
        <template #planSlug-cell="{ row }">
          {{ row.original.planSlug ?? '—' }} · {{ row.original.period === 'yearly' ? 'tahunan' : 'bulanan' }}
        </template>
        <template #amount-cell="{ row }">
          <span class="whitespace-nowrap">{{ formatIDR(row.original.amount) }}</span>
        </template>
        <template #status-cell="{ row }">
          <div class="space-y-0.5">
            <UBadge
              :color="STATUS_COLOR[row.original.status] ?? 'neutral'"
              variant="subtle"
              :label="STATUS_LABEL[row.original.status] ?? row.original.status"
            />
            <p class="text-xs text-muted">
              {{ [row.original.rawStatus, row.original.paymentType].filter(Boolean).join(' · ') }}
            </p>
          </div>
        </template>
      </UTable>
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
