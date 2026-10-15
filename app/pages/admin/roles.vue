<script setup lang="ts">
import { PERMISSIONS, PERMISSION_ACTION_LABELS, PERMISSION_GROUP_LABELS, type PermissionGroup } from '#shared/utils/permissions'

interface Role { id: string, slug: string, name: string, description: string | null, isSuperAdmin: boolean, isSystem: boolean, permissions: string[], staffCount: number }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Peran' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('roles.write'))
const roles = ref<Role[]>([])
async function load() {
  roles.value = (await apiFetch<{ items: Role[] }>('/api/admin/roles')).items
}
onMounted(load)

const groups = Object.entries(PERMISSIONS) as [PermissionGroup, Record<string, string>][]
const open = ref(false)
const editing = ref<Role | null>(null)
const form = reactive({ slug: '', name: '', description: '', permissions: [] as string[] })
const saving = ref(false)
function edit(role: Role | null) {
  editing.value = role
  Object.assign(form, role ? { slug: role.slug, name: role.name, description: role.description ?? '', permissions: [...role.permissions] } : { slug: '', name: '', description: '', permissions: [] })
  open.value = true
}
function toggle(key: string, value: boolean) {
  form.permissions = value ? [...new Set([...form.permissions, key])] : form.permissions.filter(k => k !== key)
}
async function save() {
  saving.value = true
  try {
    const body = { slug: form.slug, name: form.name, description: form.description || null, ...(editing.value?.isSuperAdmin ? {} : { permissions: form.permissions }) }
    if (editing.value) await apiFetch(`/api/admin/roles/${editing.value.id}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/roles', { method: 'POST', body })
    toast.add({ title: 'Peran disimpan.', color: 'success' })
    open.value = false
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Peran gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function remove(role: Role) {
  if (!await confirm({ title: `Hapus peran ${role.name}?`, color: 'error', confirmLabel: 'Hapus' })) return
  try {
    await apiFetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Peran gagal dihapus.'), color: 'error' })
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Peran"
      description="Kumpulan hak akses untuk staf. Peran bawaan tidak bisa dihapus."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Peran baru"
        @click="edit(null)"
      />
    </CommandBar>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard
        v-for="role in roles"
        :key="role.id"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-semibold text-highlighted">
              {{ role.name }}
            </p>
            <p class="text-sm text-muted">
              {{ role.description || role.slug }}
            </p>
          </div>
          <UBadge
            v-if="role.isSystem"
            color="neutral"
            variant="outline"
            label="Bawaan"
          />
        </div>
        <p class="text-sm text-default mt-3">
          {{ role.isSuperAdmin ? 'Semua hak akses' : `${role.permissions.length} hak akses` }} · {{ role.staffCount }} staf
        </p>
        <div
          v-if="canWrite"
          class="flex gap-2 mt-3"
        >
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            label="Ubah"
            @click="edit(role)"
          />
          <UButton
            v-if="!role.isSystem"
            size="sm"
            color="error"
            variant="ghost"
            label="Hapus"
            @click="remove(role)"
          />
        </div>
      </UCard>
    </div>

    <FormSlideover
      v-model:open="open"
      :title="editing ? `Ubah ${editing.name}` : 'Peran baru'"
      :loading="saving"
      wide
      @submit="save"
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Nama"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Slug"
            :description="editing?.isSystem ? 'Peran bawaan: slug tetap.' : 'huruf kecil dan tanda hubung'"
          >
            <UInput
              v-model="form.slug"
              :disabled="editing?.isSystem"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField label="Deskripsi">
          <UInput
            v-model="form.description"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="editing?.isSuperAdmin"
          color="info"
          variant="subtle"
          title="Superadmin selalu punya semua hak akses."
        />
        <table
          v-else
          class="w-full text-sm"
        >
          <thead>
            <tr class="text-left text-muted">
              <th class="py-1.5 font-medium">
                Bagian
              </th>
              <th
                v-for="(label, action) in PERMISSION_ACTION_LABELS"
                :key="action"
                class="py-1.5 font-medium w-20 text-center"
              >
                {{ label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="[group, keys] in groups"
              :key="group"
            >
              <td class="py-1.5 text-default">
                {{ PERMISSION_GROUP_LABELS[group] }}
              </td>
              <td
                v-for="action in ['read', 'write']"
                :key="action"
                class="py-1.5 text-center"
              >
                <UCheckbox
                  v-if="keys[action]"
                  :model-value="form.permissions.includes(keys[action]!)"
                  class="justify-center"
                  @update:model-value="(v: boolean | 'indeterminate') => toggle(keys[action]!, v === true)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </FormSlideover>
  </div>
</template>
