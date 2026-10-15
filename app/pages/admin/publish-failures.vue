<script setup lang="ts">
interface Attempt { step: string, outcome: string, errorCode: string | null, errorSubcode: string | null, fbtraceId: string | null, createdAt: string }
interface Row { id: string, workspaceId: string, workspaceName: string, platform: string, format: string, status: string, scheduledAt: string | null, attemptCount: number, lastErrorCode: string | null, lastErrorMsg: string | null, updatedAt: string, attempts: Attempt[] }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Postingan gagal' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('publishing.write'))
const platform = ref('all')
const range = ref('7d')
const errorCode = ref('')
const filters = computed(() => ({ platform: platform.value, range: range.value, errorCode: errorCode.value }))
const list = useServerList<Row>('/api/admin/publish-failures', { filters, limit: 25 })
onMounted(list.refresh)
const groups = computed(() => (list.extra.value.groups as { code: string, n: number }[] | undefined) ?? [])
const retrying = ref<string | null>(null)
async function retry(row: Row) {
  retrying.value = row.id
  try {
    await apiFetch(`/api/admin/publish-failures/${row.id}/retry`, { method: 'POST' })
    toast.add({ title: 'Dijadwalkan ulang. Yang sempat terkirim dicek dulu, tidak diterbitkan dua kali.', color: 'success' })
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal mencoba lagi.'), color: 'error' })
  } finally {
    retrying.value = null
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Postingan gagal"
      description="Target yang gagal, belum pasti, ditunda kuota, atau akunnya perlu dihubungkan ulang. Lonjakan biasanya berarti gangguan di Meta."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari ruang kerja"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="platform"
        :items="[{ value: 'all', label: 'Semua platform' }, { value: 'instagram', label: 'Instagram' }, { value: 'threads', label: 'Threads' }, { value: 'facebook', label: 'Facebook' }]"
        class="w-40"
      />
      <USelect
        v-model="range"
        :items="[{ value: '24h', label: '24 jam' }, { value: '7d', label: '7 hari' }, { value: '30d', label: '30 hari' }]"
        class="w-32"
      />
    </div>
    <div
      v-if="groups.length"
      class="flex flex-wrap gap-2 mb-4"
    >
      <UButton
        size="xs"
        :variant="errorCode === '' ? 'solid' : 'outline'"
        color="neutral"
        label="Semua"
        @click="errorCode = ''"
      />
      <UButton
        v-for="g in groups"
        :key="g.code"
        size="xs"
        :variant="errorCode === g.code ? 'solid' : 'outline'"
        color="neutral"
        :label="`${g.code} · ${g.n}`"
        @click="errorCode = errorCode === g.code ? '' : g.code"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <p
        v-if="!list.items.value.length"
        class="p-6 text-center text-sm text-muted"
      >
        Tidak ada postingan gagal di rentang ini.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="row in list.items.value"
          :key="row.id"
          class="p-4 flex flex-col lg:flex-row gap-3"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink
                :to="`/admin/workspaces/${row.workspaceId}`"
                class="font-medium text-highlighted hover:text-primary"
              >
                {{ row.workspaceName }}
              </NuxtLink>
              <span class="text-sm text-muted">{{ PLATFORM_LABEL[row.platform] }} · {{ row.format }}</span>
              <UBadge
                size="sm"
                variant="subtle"
                :color="statusOf(TARGET_STATUS, row.status).color"
                :label="statusOf(TARGET_STATUS, row.status).label"
              />
              <code
                v-if="row.lastErrorCode"
                class="text-xs text-error"
              >{{ row.lastErrorCode }}</code>
            </div>
            <p
              v-if="row.lastErrorMsg"
              class="text-sm text-default"
            >
              {{ row.lastErrorMsg }}
            </p>
            <p class="text-xs text-muted">
              Jadwal {{ row.scheduledAt ? formatDateTime(row.scheduledAt) : '—' }} · {{ row.attemptCount }} percobaan · diubah {{ formatDateTime(row.updatedAt) }}
            </p>
            <ul
              v-if="row.attempts.length"
              class="text-xs text-muted space-y-0.5"
            >
              <li
                v-for="(a, i) in row.attempts"
                :key="i"
              >
                {{ formatDateTime(a.createdAt) }} · {{ a.step }} → {{ a.outcome }}<span v-if="a.errorCode"> · {{ a.errorCode }}{{ a.errorSubcode ? `/${a.errorSubcode}` : '' }}</span><span v-if="a.fbtraceId"> · fbtrace {{ a.fbtraceId }}</span>
              </li>
            </ul>
          </div>
          <UButton
            v-if="canWrite && row.status !== 'publish_unknown'"
            size="sm"
            icon="i-lucide-rotate-ccw"
            label="Coba lagi"
            :loading="retrying === row.id"
            class="self-start"
            @click="retry(row)"
          />
        </li>
      </ul>
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
