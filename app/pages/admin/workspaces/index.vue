<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, name: string, status: string, createdAt: string, deleteRequestedAt: string | null, planSlug: string, planName: string, subscriptionStatus: string, trialEndsAt: string | null, currentPeriodEnd: string | null, ownerEmail: string | null, accounts: number }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Ruang kerja' })

const status = ref('all')
const planSlug = ref('all')
const subscriptionStatus = ref('all')
const deleteRequested = ref(false)
const filters = computed(() => ({ status: status.value, planSlug: planSlug.value, subscriptionStatus: subscriptionStatus.value, deleteRequested: deleteRequested.value ? 'true' : 'all' }))
const list = useServerList<Row>('/api/admin/workspaces', { filters, limit: 25 })
onMounted(list.refresh)
const planItems = computed(() => [{ value: 'all', label: 'Semua paket' }, ...((list.extra.value.plans as { slug: string, name: string }[] | undefined) ?? []).map(p => ({ value: p.slug, label: p.name }))])
const statusItems = [{ value: 'all', label: 'Semua status' }, { value: 'active', label: 'Aktif' }, { value: 'suspended', label: 'Ditangguhkan' }]
const subItems = [{ value: 'all', label: 'Semua langganan' }, ...Object.entries(SUBSCRIPTION_STATUS).map(([value, s]) => ({ value, label: s.label }))]

const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Ruang kerja' },
  { accessorKey: 'planName', header: 'Paket' },
  { accessorKey: 'dates', header: 'Berakhir' },
  { accessorKey: 'accounts', header: 'Akun sosial' },
  { accessorKey: 'createdAt', header: 'Daftar' }
]
</script>

<template>
  <div>
    <CommandBar
      title="Ruang kerja"
      description="Semua ruang kerja kreator. Cari nama, email atau nomor HP pemilik."
    />
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nama, email atau HP"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-40"
      />
      <USelect
        v-model="planSlug"
        :items="planItems"
        class="w-40"
      />
      <USelect
        v-model="subscriptionStatus"
        :items="subItems"
        class="w-44"
      />
      <USwitch
        v-model="deleteRequested"
        label="Minta dihapus"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Tidak ada ruang kerja."
        @select="(_: unknown, row: { original: Row }) => navigateTo(`/admin/workspaces/${row.original.id}`)"
      >
        <template #name-cell="{ row }">
          <NuxtLink
            :to="`/admin/workspaces/${row.original.id}`"
            class="block"
          >
            <span class="font-medium text-highlighted hover:text-primary">{{ row.original.name }}</span>
            <span class="block text-xs text-muted">{{ row.original.ownerEmail ?? '—' }}</span>
          </NuxtLink>
          <div class="flex gap-1 mt-1">
            <UBadge
              v-if="row.original.status !== 'active'"
              size="sm"
              variant="subtle"
              :color="statusOf(WORKSPACE_STATUS, row.original.status).color"
              :label="statusOf(WORKSPACE_STATUS, row.original.status).label"
            />
            <UBadge
              v-if="row.original.deleteRequestedAt"
              size="sm"
              variant="subtle"
              color="error"
              label="Minta dihapus"
            />
          </div>
        </template>
        <template #planName-cell="{ row }">
          <span>{{ row.original.planName }}</span>
          <UBadge
            class="ml-1"
            size="sm"
            variant="subtle"
            :color="statusOf(SUBSCRIPTION_STATUS, row.original.subscriptionStatus).color"
            :label="statusOf(SUBSCRIPTION_STATUS, row.original.subscriptionStatus).label"
          />
        </template>
        <template #dates-cell="{ row }">
          <span class="text-xs text-muted whitespace-nowrap">
            {{ row.original.subscriptionStatus === 'trialing' ? `Uji coba ${formatDate(row.original.trialEndsAt)}` : row.original.currentPeriodEnd ? formatDate(row.original.currentPeriodEnd) : '—' }}
          </span>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap text-xs">{{ formatDate(row.original.createdAt) }}</span>
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
