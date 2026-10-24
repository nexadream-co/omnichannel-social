<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, platform: string, username: string | null, status: string, tokenExpiresAt: string | null, scopes: string[], workspaceId: string, workspaceName: string, lastPublishedAt: string | null }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Kesehatan akun sosial' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('channels.write'))
const canSettings = computed(() => auth.hasPermission('settings.write'))
const isSuper = computed(() => Boolean(auth.profile.value?.user.role.isSuperAdmin))
const platform = ref('all')
const status = ref('all')
const expiring = ref(0)
const filters = computed(() => ({ platform: platform.value, status: status.value, expiringWithinDays: expiring.value }))
const list = useServerList<Row>('/api/admin/social-accounts', { filters, limit: 25 })

const switches = reactive({ publishingPaused: false, autoReplyEnabled: true, pausedMessage: '' })
async function loadSwitches() {
  const { values } = await apiFetch<{ values: Record<string, string> }>('/api/admin/settings')
  Object.assign(switches, { publishingPaused: values['channels.publishing.paused'] === 'true', autoReplyEnabled: values['channels.autoReply.enabled'] !== 'false', pausedMessage: values['channels.publishing.pausedMessage'] ?? '' })
}
onMounted(async () => {
  await list.refresh()
  if (auth.hasPermission('settings.read')) await loadSwitches()
})
async function setSwitch(key: 'channels.publishing.paused' | 'channels.autoReply.enabled', value: boolean) {
  const labels = { 'channels.publishing.paused': value ? 'Jeda semua publikasi?' : 'Lanjutkan publikasi?', 'channels.autoReply.enabled': value ? 'Nyalakan Balas Otomatis?' : 'Matikan Balas Otomatis untuk semua kreator?' }
  if (!await confirm({ title: labels[key], description: 'Berlaku untuk seluruh platform dan tercatat di log aktivitas.', color: 'warning', confirmLabel: 'Ya' })) return
  try {
    await apiFetch('/api/admin/settings', { method: 'PATCH', body: { values: { [key]: String(value), ...(key === 'channels.publishing.paused' && { 'channels.publishing.pausedMessage': switches.pausedMessage }) } } })
    toast.add({ title: 'Saklar disimpan.', color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal menyimpan.'), color: 'error' })
  }
  await loadSwitches()
}
async function refresh(row: Row) {
  try {
    await apiFetch(`/api/admin/social-accounts/${row.id}/refresh`, { method: 'POST' })
    toast.add({ title: 'Pembaruan token dijalankan.', color: 'success' })
    setTimeout(list.refresh, 1500)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal.'), color: 'error' })
  }
}
const columns: TableColumn<Row>[] = [
  { accessorKey: 'username', header: 'Akun' },
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'tokenExpiresAt', header: 'Token berakhir' },
  { accessorKey: 'lastPublishedAt', header: 'Terbit terakhir' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="space-y-4">
    <CommandBar
      title="Kesehatan akun sosial"
      description="Semua akun yang terhubung. Token tidak pernah ditampilkan."
    />
    <UCard v-if="auth.hasPermission('settings.read')">
      <template #header>
        <p class="font-semibold text-highlighted">
          Saklar darurat
        </p>
      </template>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <USwitch
            :model-value="switches.publishingPaused"
            :disabled="!canSettings"
            label="Jeda semua publikasi"
            description="Postingan tetap terjadwal dan terbit setelah jeda dicabut."
            @update:model-value="(v: boolean) => setSwitch('channels.publishing.paused', v)"
          />
          <UInput
            v-model="switches.pausedMessage"
            :disabled="!canSettings"
            placeholder="Pesan untuk kreator saat dijeda"
            class="w-full"
            size="sm"
          />
        </div>
        <USwitch
          :model-value="switches.autoReplyEnabled"
          :disabled="!isSuper"
          label="Balas Otomatis aktif"
          :description="isSuper ? 'Matikan saat Instagram menandai DM sebagai spam.' : 'Hanya superadmin yang bisa mengubah.'"
          @update:model-value="(v: boolean) => setSwitch('channels.autoReply.enabled', v)"
        />
      </div>
    </UCard>
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari username atau ruang kerja"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="platform"
        :items="[{ value: 'all', label: 'Semua platform' }, { value: 'instagram', label: 'Instagram' }, { value: 'threads', label: 'Threads' }, { value: 'facebook', label: 'Facebook' }]"
        class="w-40"
      />
      <USelect
        v-model="status"
        :items="[{ value: 'all', label: 'Semua status' }, { value: 'active', label: 'Aktif' }, { value: 'needs_reauth', label: 'Perlu dihubungkan ulang' }, { value: 'disabled', label: 'Nonaktif' }]"
        class="w-52"
      />
      <USelect
        v-model="expiring"
        :items="[{ value: 0, label: 'Semua token' }, { value: 7, label: 'Berakhir ≤ 7 hari' }, { value: 14, label: 'Berakhir ≤ 14 hari' }]"
        class="w-44"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Tidak ada akun."
      >
        <template #username-cell="{ row }">
          <span class="text-muted">{{ PLATFORM_LABEL[row.original.platform] }}</span> {{ row.original.username ?? '—' }}
        </template>
        <template #workspaceName-cell="{ row }">
          <NuxtLink
            :to="`/admin/workspaces/${row.original.workspaceId}`"
            class="hover:text-primary"
          >
            {{ row.original.workspaceName }}
          </NuxtLink>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            size="sm"
            variant="subtle"
            :color="statusOf(ACCOUNT_STATUS, row.original.status).color"
            :label="statusOf(ACCOUNT_STATUS, row.original.status).label"
          />
        </template>
        <template #tokenExpiresAt-cell="{ row }">
          <span class="text-xs whitespace-nowrap">{{ row.original.tokenExpiresAt ? formatDate(row.original.tokenExpiresAt) : 'tidak berakhir' }}</span>
        </template>
        <template #lastPublishedAt-cell="{ row }">
          <span class="text-xs text-muted whitespace-nowrap">{{ row.original.lastPublishedAt ? formatDateTime(row.original.lastPublishedAt) : '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="canWrite && row.original.status !== 'disabled'"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="Perbarui token"
            @click="refresh(row.original)"
          />
        </template>
      </AdminTable>
    </UCard>
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
      />
    </div>
  </div>
</template>
