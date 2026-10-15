<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, topic: string, dedupeKey: string, receivedAt: string, processedAt: string | null, attempts: number, error: string | null, payload: unknown }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Meta webhook' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('channels.write'))
const state = ref('all')
const filters = computed(() => ({ state: state.value }))
const list = useServerList<Row>('/api/admin/meta-webhooks', { filters, limit: 25 })
onMounted(list.refresh)
const detail = ref<Row | null>(null)
const columns: TableColumn<Row>[] = [
  { accessorKey: 'receivedAt', header: 'Diterima' },
  { accessorKey: 'topic', header: 'Topik' },
  { accessorKey: 'dedupeKey', header: 'Kunci' },
  { accessorKey: 'result', header: 'Hasil' },
  { accessorKey: 'actions', header: '' }
]
async function replay(row: Row) {
  try {
    await apiFetch(`/api/admin/meta-webhooks/${row.id}/replay`, { method: 'POST' })
    toast.add({ title: 'Diproses ulang. DM tidak akan terkirim dua kali.', color: 'success' })
    setTimeout(list.refresh, 1500)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal.'), color: 'error' })
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Meta webhook"
      :description="`Kiriman dari Meta (komentar Instagram, dll). Belum diproses: ${list.extra.value.backlog ?? 0}. Isi komentar hanya terlihat oleh superadmin.`"
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari kunci (mis. ID komentar)"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="state"
        :items="[{ value: 'all', label: 'Semua' }, { value: 'pending', label: 'Belum diproses' }, { value: 'error', label: 'Ada kendala' }, { value: 'processed', label: 'Diproses' }]"
        class="w-44"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada webhook."
      >
        <template #receivedAt-cell="{ row }">
          <span class="text-xs whitespace-nowrap">{{ formatDateTime(row.original.receivedAt) }}</span>
        </template>
        <template #topic-cell="{ row }">
          <code class="text-xs">{{ row.original.topic }}</code>
        </template>
        <template #dedupeKey-cell="{ row }">
          <code class="text-xs text-muted truncate block max-w-64">{{ row.original.dedupeKey }}</code>
        </template>
        <template #result-cell="{ row }">
          <UBadge
            v-if="row.original.error"
            size="sm"
            color="error"
            variant="subtle"
            :label="row.original.error.slice(0, 40)"
          />
          <UBadge
            v-else-if="row.original.processedAt"
            size="sm"
            color="success"
            variant="subtle"
            label="Diproses"
          />
          <UBadge
            v-else
            size="sm"
            color="warning"
            variant="subtle"
            label="Menunggu"
          />
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
              @click="replay(row.original)"
            />
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
    <UModal
      :open="Boolean(detail)"
      title="Isi webhook"
      @update:open="(v: boolean) => { if (!v) detail = null }"
    >
      <template #body>
        <pre class="text-xs bg-elevated rounded-md p-3 overflow-auto max-h-96">{{ JSON.stringify(detail?.payload, null, 2) }}</pre>
      </template>
    </UModal>
  </div>
</template>
