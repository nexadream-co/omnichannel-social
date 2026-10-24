<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Row { id: string, name: string, email: string, phone: string | null, isActive: boolean, roleId: string, roleName: string, isSuperAdmin: boolean, lastLoginAt: string | null, createdAt: string }
interface Role { id: string, name: string, isSuperAdmin: boolean }
interface Invitation { id: string, email: string, name: string | null, roleName: string, expiresAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Staf' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('staff.write'))
const isSuper = computed(() => Boolean(auth.profile.value?.user.role.isSuperAdmin))
const list = useServerList<Row>('/api/admin/staff', { limit: 50 })
onMounted(list.refresh)
const roles = computed(() => (list.extra.value.roles as Role[] | undefined) ?? [])
const invitations = computed(() => (list.extra.value.invitations as Invitation[] | undefined) ?? [])
const roleItems = computed(() => roles.value.filter(r => isSuper.value || !r.isSuperAdmin).map(r => ({ value: r.id, label: r.name })))

const inviteOpen = ref(false)
const invite = reactive({ email: '', name: '', roleId: '' })
const editOpen = ref(false)
const edit = reactive({ id: '', name: '', phone: '', roleId: '' })
const saving = ref(false)
async function run(fn: () => Promise<unknown>, message: string) {
  saving.value = true
  try {
    await fn()
    toast.add({ title: message, color: 'success' })
    await list.refresh()
    return true
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
    return false
  } finally {
    saving.value = false
  }
}
function openInvite() {
  Object.assign(invite, { email: '', name: '', roleId: roles.value.find(r => r.name === 'Support')?.id ?? roleItems.value[0]?.value ?? '' })
  inviteOpen.value = true
}
async function sendInvite() {
  if (await run(() => apiFetch('/api/admin/staff', { method: 'POST', body: { email: invite.email, name: invite.name || undefined, roleId: invite.roleId } }), 'Undangan terkirim.')) inviteOpen.value = false
}
function openEdit(row: Row) {
  Object.assign(edit, { id: row.id, name: row.name, phone: row.phone ?? '', roleId: row.roleId })
  editOpen.value = true
}
async function saveEdit() {
  if (await run(() => apiFetch(`/api/admin/staff/${edit.id}`, { method: 'PATCH', body: { name: edit.name, phone: edit.phone || null, roleId: edit.roleId } }), 'Staf disimpan.')) editOpen.value = false
}
async function toggleActive(row: Row) {
  if (row.isActive && !await confirm({ title: `Nonaktifkan ${row.name}?`, description: 'Semua sesinya langsung dicabut.', color: 'error', confirmLabel: 'Nonaktifkan' })) return
  await run(() => apiFetch(`/api/admin/staff/${row.id}`, { method: 'PATCH', body: { isActive: !row.isActive } }), row.isActive ? 'Staf dinonaktifkan.' : 'Staf diaktifkan.')
}
async function impersonate(row: Row) {
  if (!await confirm({ title: `Menyamar sebagai ${row.name}?`, description: 'Back-office terbuka dengan hak akses staf ini selama 1 jam. Semua tindakan tercatat.', confirmLabel: 'Impersonate' })) return
  try {
    const result = await apiFetch<{ redirect: string }>(`/api/admin/staff/${row.id}/impersonate`, { method: 'POST' })
    window.location.href = result.redirect
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
  }
}
const revokeInvite = (inv: Invitation) => run(() => apiFetch(`/api/admin/staff-invitations/${inv.id}`, { method: 'DELETE' }), 'Undangan dibatalkan.')
const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Staf' },
  { accessorKey: 'roleName', header: 'Peran' },
  { accessorKey: 'lastLoginAt', header: 'Masuk terakhir' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="space-y-4">
    <CommandBar
      title="Staf"
      description="Tim Socialz.id yang bisa masuk ke back-office. Staf diundang lewat email."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-user-plus"
        label="Undang staf"
        @click="openInvite"
      />
    </CommandBar>
    <UCard
      v-if="invitations.length"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <template #header>
        <p class="font-semibold text-highlighted">
          Undangan menunggu
        </p>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="inv in invitations"
          :key="inv.id"
          class="px-4 py-2.5 flex flex-wrap items-center gap-3"
        >
          <span class="text-default">{{ inv.name ?? inv.email }}</span>
          <span class="text-muted">{{ inv.email }} · {{ inv.roleName }} · berlaku sampai {{ formatDate(inv.expiresAt) }}</span>
          <UButton
            v-if="canWrite"
            size="xs"
            color="neutral"
            variant="ghost"
            label="Batalkan"
            class="ml-auto"
            @click="revokeInvite(inv)"
          />
        </li>
      </ul>
    </UCard>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada staf."
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
            {{ row.original.email }}
          </p>
        </template>
        <template #roleName-cell="{ row }">
          <UBadge
            :color="row.original.isSuperAdmin ? 'primary' : 'neutral'"
            variant="subtle"
            :label="row.original.roleName"
          />
        </template>
        <template #lastLoginAt-cell="{ row }">
          <span class="text-xs text-muted">{{ row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Belum pernah' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div
            v-if="canWrite && row.original.id !== auth.profile.value?.user.id && (isSuper || !row.original.isSuperAdmin)"
            class="flex justify-end gap-1"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="Ubah"
              @click="openEdit(row.original)"
            />
            <UButton
              size="xs"
              :color="row.original.isActive ? 'error' : 'neutral'"
              variant="ghost"
              :label="row.original.isActive ? 'Nonaktifkan' : 'Aktifkan'"
              @click="toggleActive(row.original)"
            />
            <UButton
              v-if="isSuper && !row.original.isSuperAdmin && row.original.isActive && !auth.profile.value?.impersonating"
              size="xs"
              color="neutral"
              variant="outline"
              label="Impersonate"
              @click="impersonate(row.original)"
            />
          </div>
        </template>
      </AdminTable>
    </UCard>

    <FormSlideover
      v-model:open="inviteOpen"
      title="Undang staf"
      description="Undangan berlaku 7 hari. Penerima membuat nama dan kata sandi sendiri."
      :loading="saving"
      submit-label="Kirim undangan"
      @submit="sendInvite"
    >
      <div class="space-y-4">
        <UFormField
          label="Email"
          required
        >
          <UInput
            v-model="invite.email"
            type="email"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Nama (opsional)">
          <UInput
            v-model="invite.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Peran"
          required
        >
          <USelect
            v-model="invite.roleId"
            :items="roleItems"
            class="w-full"
          />
        </UFormField>
      </div>
    </FormSlideover>
    <FormSlideover
      v-model:open="editOpen"
      title="Ubah staf"
      :loading="saving"
      @submit="saveEdit"
    >
      <div class="space-y-4">
        <UFormField label="Nama">
          <UInput
            v-model="edit.name"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Nomor HP">
          <UInput
            v-model="edit.phone"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Peran">
          <USelect
            v-model="edit.roleId"
            :items="roleItems"
            class="w-full"
          />
        </UFormField>
      </div>
    </FormSlideover>
  </div>
</template>
