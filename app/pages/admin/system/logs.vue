<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'

interface Row { id: string, level: string, msg: string, path: string | null, requestId: string | null, fields: Record<string, unknown> | null, createdAt: string, userId: string | null, userEmail: string | null, userName: string | null, workspaceId: string | null, workspaceName: string | null, staffUserId: string | null, staffName: string | null }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Log error' })
const route = useRoute()
const user = ref(typeof route.query.user === 'string' ? route.query.user : '')
const debouncedUser = refDebounced(user, 400)
const level = ref('all')
const range = ref('7d')
const filters = computed(() => ({ user: debouncedUser.value.trim(), level: level.value, range: range.value }))
const list = useServerList<Row>('/api/admin/system/logs', { filters, limit: 50 })
onMounted(list.refresh)
const columns: TableColumn<Row>[] = [
  { accessorKey: 'createdAt', header: 'Waktu' },
  { accessorKey: 'level', header: 'Level' },
  { accessorKey: 'msg', header: 'Kejadian' },
  { accessorKey: 'userEmail', header: 'Pengguna' },
  { accessorKey: 'detail', header: '' }
]
const LEVELS: Record<string, { label: string, color: 'error' | 'warning' }> = {
  error: { label: 'Error', color: 'error' },
  warn: { label: 'Peringatan', color: 'warning' }
}
/** The one-line reason shown under the event name: the platform's or the app's own message when the line has one. */
function summary(row: Row): string {
  const f = row.fields ?? {}
  const pick = (key: string) => typeof f[key] === 'string' ? f[key] as string : ''
  const nested = (f.error && typeof f.error === 'object' ? (f.error as { message?: string }).message : '') ?? ''
  return pick('platformErrorDescription') || pick('message') || nested || pick('error') || ''
}
const detail = ref<Row | null>(null)
function filterBy(value: string) {
  user.value = value
  detail.value = null
}
</script>

<template>
  <div>
    <CommandBar
      title="Log error"
      description="Peringatan dan error dari server, dengan pengguna yang mengalaminya. Disimpan 30 hari. Rentang waktu memakai jam WIB."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="user"
        icon="i-lucide-user-search"
        placeholder="Email kreator, ID pengguna atau ruang kerja"
        class="flex-1 min-w-56"
      />
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari kejadian, alamat atau pesan"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="level"
        :items="[{ value: 'all', label: 'Semua level' }, { value: 'error', label: 'Error' }, { value: 'warn', label: 'Peringatan' }]"
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
        empty="Tidak ada error pada rentang ini."
      >
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap text-xs">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #level-cell="{ row }">
          <UBadge
            :color="LEVELS[row.original.level]?.color ?? 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ LEVELS[row.original.level]?.label ?? row.original.level }}
          </UBadge>
        </template>
        <template #msg-cell="{ row }">
          <code class="text-xs">{{ row.original.msg }}</code>
          <p
            v-if="summary(row.original)"
            class="text-xs text-muted max-w-md truncate"
          >
            {{ summary(row.original) }}
          </p>
        </template>
        <template #userEmail-cell="{ row }">
          <button
            v-if="row.original.userId"
            type="button"
            class="text-left text-sm hover:text-primary"
            @click="filterBy(row.original.userEmail ?? row.original.userId)"
          >
            {{ row.original.userEmail ?? row.original.userId }}
            <span
              v-if="row.original.workspaceName"
              class="block text-xs text-muted"
            >{{ row.original.workspaceName }}</span>
          </button>
          <span
            v-else-if="row.original.staffName"
            class="text-sm"
          >{{ row.original.staffName }} <span class="text-xs text-muted">(staf)</span></span>
          <span
            v-else
            class="text-muted"
          >—</span>
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
      :title="detail?.msg ?? ''"
      @update:open="(v: boolean) => { if (!v) detail = null }"
    >
      <template #body>
        <dl
          v-if="detail"
          class="space-y-2 text-sm"
        >
          <div>
            <dt class="text-muted">
              Waktu
            </dt><dd>{{ formatDateTime(detail.createdAt) }}</dd>
          </div>
          <div v-if="detail.userId">
            <dt class="text-muted">
              Pengguna
            </dt><dd>
              {{ detail.userName ?? '' }} {{ detail.userEmail ?? detail.userId }}
              <UButton
                size="xs"
                variant="link"
                @click="filterBy(detail.userEmail ?? detail.userId)"
              >
                Semua log pengguna ini
              </UButton>
            </dd>
          </div>
          <div v-if="detail.workspaceId">
            <dt class="text-muted">
              Ruang kerja
            </dt><dd>
              <NuxtLink
                :to="`/admin/workspaces/${detail.workspaceId}`"
                class="hover:text-primary"
              >
                {{ detail.workspaceName ?? detail.workspaceId }}
              </NuxtLink>
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Alamat
            </dt><dd class="break-all">
              <code class="text-xs">{{ detail.path ?? '—' }}</code>
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              ID permintaan
            </dt><dd><code class="text-xs">{{ detail.requestId ?? '—' }}</code></dd>
          </div>
          <div>
            <dt class="text-muted">
              Data
            </dt><dd><pre class="text-xs bg-elevated rounded-md p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">{{ JSON.stringify(detail.fields, null, 2) }}</pre></dd>
          </div>
        </dl>
      </template>
    </UModal>
  </div>
</template>
