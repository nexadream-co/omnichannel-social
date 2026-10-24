<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { AUDIT_ACTION_LABELS } from '#shared/utils/audit'

interface Row { id: string, audience: string, actorId: string | null, actorName: string | null, impersonatorId: string | null, workspaceId: string | null, workspaceName: string | null, action: string, targetType: string | null, targetId: string | null, metadata: unknown, ip: string | null, userAgent: string | null, createdAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Log aktivitas' })
const audience = ref('all')
const range = ref('7d')
const action = ref('all')
const filters = computed(() => ({ audience: audience.value, range: range.value, action: action.value === 'all' ? '' : action.value }))
const list = useServerList<Row>('/api/admin/audit-logs', { filters, limit: 50 })
onMounted(list.refresh)
const actionItems = [{ value: 'all', label: 'Semua tindakan' }, ...Object.entries(AUDIT_ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))]
const columns: TableColumn<Row>[] = [
  { accessorKey: 'createdAt', header: 'Waktu' },
  { accessorKey: 'actorName', header: 'Pelaku' },
  { accessorKey: 'action', header: 'Tindakan' },
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'ip', header: 'IP' },
  { accessorKey: 'detail', header: '' }
]
const detail = ref<Row | null>(null)
</script>

<template>
  <div>
    <CommandBar
      title="Log aktivitas"
      description="Semua tindakan penting dari kreator dan staf. Rentang waktu memakai jam WIB."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari pelaku, ruang kerja atau target"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="action"
        :items="actionItems"
        class="w-56"
      />
      <USelect
        v-model="audience"
        :items="[{ value: 'all', label: 'Kreator & staf' }, { value: 'creator', label: 'Kreator' }, { value: 'staff', label: 'Staf' }]"
        class="w-40"
      />
      <USelect
        v-model="range"
        :items="[{ value: 'today', label: 'Hari ini' }, { value: '7d', label: '7 hari' }, { value: '30d', label: '30 hari' }, { value: 'all', label: 'Semua' }]"
        class="w-32"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Tidak ada aktivitas."
      >
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap text-xs">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #actorName-cell="{ row }">
          <p class="text-sm">
            {{ row.original.actorName ?? '—' }}
          </p>
          <p class="text-xs text-muted">
            {{ row.original.audience === 'staff' ? 'Staf' : 'Kreator' }}<span
              v-if="row.original.impersonatorId"
              class="text-warning"
            > · via impersonate</span>
          </p>
        </template>
        <template #action-cell="{ row }">
          {{ AUDIT_ACTION_LABELS[row.original.action] ?? row.original.action }}
        </template>
        <template #workspaceName-cell="{ row }">
          <NuxtLink
            v-if="row.original.workspaceId"
            :to="`/admin/workspaces/${row.original.workspaceId}`"
            class="hover:text-primary"
          >
            {{ row.original.workspaceName }}
          </NuxtLink>
          <span
            v-else
            class="text-muted"
          >—</span>
        </template>
        <template #ip-cell="{ row }">
          <code class="text-xs">{{ row.original.ip ?? '—' }}</code>
        </template>
        <template #detail-cell="{ row }">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-braces"
            aria-label="Detail"
            @click="detail = row.original"
          />
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
      :title="detail ? (AUDIT_ACTION_LABELS[detail.action] ?? detail.action) : ''"
      @update:open="(v: boolean) => { if (!v) detail = null }"
    >
      <template #body>
        <dl
          v-if="detail"
          class="space-y-2 text-sm"
        >
          <div>
            <dt class="text-muted">
              Target
            </dt><dd>{{ detail.targetType ?? '—' }} {{ detail.targetId ?? '' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Perangkat
            </dt><dd class="break-all">
              {{ detail.userAgent ?? '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Data
            </dt><dd><pre class="text-xs bg-elevated rounded-md p-3 overflow-auto max-h-80">{{ JSON.stringify(detail.metadata, null, 2) }}</pre></dd>
          </div>
        </dl>
      </template>
    </UModal>
  </div>
</template>
