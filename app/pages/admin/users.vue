<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, name: string, email: string, phone: string | null, emailVerified: boolean, isActive: boolean, lastLoginAt: string | null, lastSeenAt: string | null, createdAt: string, methods: string[], memberships: { workspaceId: string, workspaceName: string, role: string }[] }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pengguna kreator' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const isSuper = computed(() => Boolean(auth.profile.value?.user.role.isSuperAdmin))
const list = useServerList<Row>('/api/admin/users', { limit: 25 })
onMounted(list.refresh)
const METHOD: Record<string, string> = { password: 'Kata sandi', google: 'Google' }
const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Pengguna' },
  { accessorKey: 'memberships', header: 'Ruang kerja' },
  { accessorKey: 'methods', header: 'Cara masuk' },
  { accessorKey: 'lastLoginAt', header: 'Terakhir' },
  { accessorKey: 'actions', header: '' }
]
async function impersonate(row: Row, workspaceId?: string) {
  if (!await confirm({ title: `Menyamar sebagai ${row.name}?`, description: 'Konsol kreator terbuka selama 1 jam. Pembayaran tidak bisa dilakukan dan semua tindakan tercatat.', confirmLabel: 'Impersonate' })) return
  try {
    const result = await apiFetch<{ redirect: string }>(`/api/admin/users/${row.id}/impersonate`, { method: 'POST', body: { workspaceId } })
    window.location.href = result.redirect
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
  }
}
async function revoke(row: Row) {
  if (!await confirm({ title: `Keluarkan ${row.name} dari semua perangkat?`, description: 'Dipakai saat akun diduga dibobol. Pengguna harus masuk lagi.', color: 'error', confirmLabel: 'Keluarkan' })) return
  try {
    await apiFetch(`/api/admin/users/${row.id}/revoke-sessions`, { method: 'POST' })
    toast.add({ title: 'Semua sesi dicabut.', color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Pengguna kreator"
      description="Setiap login kreator di semua ruang kerja."
    />
    <UInput
      v-model="list.search.value"
      icon="i-lucide-search"
      placeholder="Cari nama, email atau HP"
      class="w-full mb-4"
    />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Tidak ada pengguna."
      >
        <template #name-cell="{ row }">
          <p class="font-medium text-highlighted">
            {{ row.original.name }}
            <UBadge
              v-if="!row.original.isActive"
              size="sm"
              color="neutral"
              variant="outline"
              label="Nonaktif"
              class="ml-1"
            />
          </p>
          <p class="text-xs text-muted">
            {{ row.original.email }} <UIcon
              v-if="row.original.emailVerified"
              name="i-lucide-badge-check"
              class="size-3.5 text-success align-[-2px]"
            />{{ row.original.phone ? ` · ${row.original.phone}` : '' }}
          </p>
        </template>
        <template #memberships-cell="{ row }">
          <p
            v-for="m in row.original.memberships"
            :key="m.workspaceId"
            class="text-sm"
          >
            <NuxtLink
              :to="`/admin/workspaces/${m.workspaceId}`"
              class="hover:text-primary"
            >
              {{ m.workspaceName }}
            </NuxtLink>
            <span class="text-muted"> · {{ MEMBER_ROLE[m.role] ?? m.role }}</span>
          </p>
        </template>
        <template #methods-cell="{ row }">
          <div class="flex gap-1">
            <UBadge
              v-for="m in row.original.methods"
              :key="m"
              size="sm"
              color="neutral"
              variant="subtle"
              :label="METHOD[m] ?? m"
            />
          </div>
        </template>
        <template #lastLoginAt-cell="{ row }">
          <span class="text-xs text-muted whitespace-nowrap">{{ row.original.lastSeenAt ? formatDateTime(row.original.lastSeenAt) : row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div
            v-if="isSuper"
            class="flex justify-end gap-1"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              label="Impersonate"
              :disabled="!row.original.memberships.length || !row.original.isActive"
              @click="impersonate(row.original, row.original.memberships[0]?.workspaceId)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-log-out"
              aria-label="Cabut semua sesi"
              @click="revoke(row.original)"
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
  </div>
</template>
