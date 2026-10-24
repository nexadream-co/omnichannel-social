<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, provider: string, orderId: string | null, processedAt: string | null, error: string | null, replayCount: number, createdAt: string, gatewayStatus: string | null, payload: unknown }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Payment callback' })

const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('payments.write'))
const state = ref('all')
const filters = computed(() => ({ state: state.value }))
const list = useServerList<Row>('/api/admin/webhook-events', { filters, limit: 25 })
onMounted(list.refresh)
const stateItems = [{ value: 'all', label: 'Semua' }, { value: 'processed', label: 'Diproses' }, { value: 'error', label: 'Ada kendala' }, { value: 'pending', label: 'Belum diproses' }]

const columns: TableColumn<Row>[] = [
  { accessorKey: 'createdAt', header: 'Diterima' },
  { accessorKey: 'orderId', header: 'Nomor pesanan (gateway)' },
  { accessorKey: 'gatewayStatus', header: 'Kata gateway' },
  { accessorKey: 'result', header: 'Yang kita lakukan' },
  { accessorKey: 'actions', header: '' }
]

const replaying = ref<string | null>(null)
async function replay(row: Row) {
  replaying.value = row.id
  try {
    const result = await apiFetch<{ applied: boolean, noop?: boolean, reason?: string, status: string | null }>(`/api/admin/webhook-events/${row.id}/replay`, { method: 'POST' })
    toast.add({ title: result.applied ? `Diterapkan: ${result.status}` : result.noop ? 'Sudah sesuai, tidak ada yang berubah.' : `Tidak diterapkan: ${result.reason ?? '—'}`, color: result.applied || result.noop ? 'success' : 'warning' })
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Replay gagal.'), color: 'error' })
  } finally {
    replaying.value = null
  }
}
const detail = ref<Row | null>(null)
</script>

<template>
  <div>
    <CommandBar
      title="Payment callback"
      description="Setiap callback dari gateway disimpan dulu. Status selalu dibaca ulang dari Payment Hub sebelum diterapkan."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nomor pesanan"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="state"
        :items="stateItems"
        class="w-44"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada callback."
      >
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #orderId-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.orderId ?? '—' }}</span>
        </template>
        <template #gatewayStatus-cell="{ row }">
          <code class="text-xs">{{ row.original.gatewayStatus ?? '—' }}</code>
        </template>
        <template #result-cell="{ row }">
          <div class="space-y-0.5">
            <UBadge
              v-if="!row.original.processedAt"
              color="warning"
              variant="subtle"
              label="Belum diproses"
            />
            <UBadge
              v-else-if="row.original.error === 'unknown order'"
              color="neutral"
              variant="subtle"
              label="Bukan pesanan Socialz.id"
            />
            <UBadge
              v-else-if="row.original.error"
              color="error"
              variant="subtle"
              label="Ada kendala"
            />
            <UBadge
              v-else
              color="success"
              variant="subtle"
              label="Diproses"
            />
            <p
              v-if="row.original.error && row.original.error !== 'unknown order'"
              class="text-xs text-error max-w-64 truncate"
            >
              {{ row.original.error }}
            </p>
            <p
              v-if="row.original.replayCount"
              class="text-xs text-muted"
            >
              Diulang {{ row.original.replayCount }}×
            </p>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-braces"
              aria-label="Lihat isi"
              @click="detail = row.original"
            />
            <UButton
              v-if="canWrite"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-ccw"
              label="Ulangi"
              :loading="replaying === row.original.id"
              @click="replay(row.original)"
            />
          </div>
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
    <UModal
      :open="Boolean(detail)"
      title="Isi callback"
      @update:open="(v: boolean) => { if (!v) detail = null }"
    >
      <template #body>
        <pre class="text-xs bg-elevated rounded-md p-3 overflow-auto max-h-96">{{ JSON.stringify(detail?.payload, null, 2) }}</pre>
      </template>
    </UModal>
  </div>
</template>
