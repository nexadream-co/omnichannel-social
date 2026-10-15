<script setup lang="ts">
interface Menu { id: string, parentId: string | null, label: string, slug: string, path: string | null, icon: string | null, permissionKey: string | null, order: number, isActive: boolean }
interface Node extends Menu { depth: number, siblings: Menu[] }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Menu' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('menus.write'))
const rows = ref<Menu[]>([])
const permissionKeys = ref<string[]>([])
async function load() {
  const result = await apiFetch<{ items: Menu[], permissionKeys: string[] }>('/api/admin/menus')
  rows.value = result.items
  permissionKeys.value = result.permissionKeys
}
/** After an edit the sidebar shows the new tree straight away. */
async function reloadAll() {
  await load()
  useState('admin:menus').value = (await apiFetch<{ items: unknown[] }>('/api/admin/menus/tree')).items
}
onMounted(load)

/** Flatten the tree depth-first (max 3 levels) so every level is visible and editable. */
const flat = computed<Node[]>(() => {
  const out: Node[] = []
  const walk = (parentId: string | null, depth: number) => {
    const siblings = rows.value.filter(r => r.parentId === parentId).sort((a, b) => a.order - b.order)
    for (const row of siblings) {
      out.push({ ...row, depth, siblings })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const open = ref(false)
const editing = ref<Menu | null>(null)
const form = reactive({ slug: '', label: '', path: '', icon: '', permissionKey: '', parentId: '', order: 0, isActive: true })
const saving = ref(false)
function edit(row: Menu | null, parentId: string | null = null) {
  editing.value = row
  Object.assign(form, row
    ? { slug: row.slug, label: row.label, path: row.path ?? '', icon: row.icon ?? '', permissionKey: row.permissionKey ?? 'none', parentId: row.parentId ?? 'none', order: row.order, isActive: row.isActive }
    : { slug: '', label: '', path: '', icon: '', permissionKey: 'none', parentId: parentId ?? 'none', order: rows.value.filter(r => r.parentId === parentId).length, isActive: true })
  open.value = true
}
const parentItems = computed(() => [{ value: 'none', label: 'Tanpa induk (judul bagian)' }, ...flat.value.filter(n => n.depth < 2 && n.id !== editing.value?.id).map(n => ({ value: n.id, label: `${'— '.repeat(n.depth)}${n.label}` }))])
const permissionItems = computed(() => [{ value: 'none', label: 'Tanpa hak akses (grup)' }, ...permissionKeys.value.map(k => ({ value: k, label: k }))])
async function save() {
  saving.value = true
  try {
    const body = { slug: form.slug, label: form.label, path: form.path || null, icon: form.icon || null, permissionKey: form.permissionKey === 'none' ? null : form.permissionKey, parentId: form.parentId === 'none' ? null : form.parentId, order: Number(form.order), isActive: form.isActive }
    if (editing.value) await apiFetch(`/api/admin/menus/${editing.value.id}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/menus', { method: 'POST', body })
    toast.add({ title: 'Menu disimpan.', color: 'success' })
    open.value = false
    await reloadAll()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Menu gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function move(node: Node, delta: number) {
  const ids = node.siblings.map(s => s.id)
  const index = ids.indexOf(node.id)
  const target = index + delta
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  await apiFetch('/api/admin/menus/reorder', { method: 'POST', body: { ids } })
  await reloadAll()
}
async function remove(node: Node) {
  if (!await confirm({ title: `Hapus menu ${node.label}?`, color: 'error', confirmLabel: 'Hapus' })) return
  try {
    await apiFetch(`/api/admin/menus/${node.id}`, { method: 'DELETE' })
    await reloadAll()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Menu gagal dihapus.'), color: 'error' })
  }
}
</script>

<template>
  <div class="max-w-4xl">
    <CommandBar
      title="Menu"
      description="Susunan sidebar back-office: judul bagian, item, dan grup (maksimal 3 tingkat)."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Judul bagian"
        @click="edit(null)"
      />
    </CommandBar>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li
          v-for="node in flat"
          :key="node.id"
          class="flex items-center gap-2 py-2 pr-3"
          :style="{ paddingLeft: `${16 + node.depth * 28}px` }"
        >
          <UIcon
            :name="node.icon || (node.path ? 'i-lucide-dot' : 'i-lucide-folder')"
            class="size-4 text-muted shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p
              class="text-sm"
              :class="node.depth === 0 && !node.path ? 'font-semibold text-highlighted' : 'text-default'"
            >
              {{ node.label }} <UBadge
                v-if="!node.isActive"
                size="sm"
                color="neutral"
                variant="outline"
                label="Nonaktif"
              />
            </p>
            <p class="text-xs text-muted truncate">
              {{ node.path ?? (node.depth === 0 ? 'judul bagian' : 'grup') }}{{ node.permissionKey ? ` · ${node.permissionKey}` : '' }}
            </p>
          </div>
          <template v-if="canWrite">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-chevron-up"
              aria-label="Naik"
              :disabled="node.siblings[0]?.id === node.id"
              @click="move(node, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-chevron-down"
              aria-label="Turun"
              :disabled="node.siblings.at(-1)?.id === node.id"
              @click="move(node, 1)"
            />
            <UButton
              v-if="node.depth < 2 && !node.path"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              aria-label="Tambah sub-menu"
              @click="edit(null, node.id)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="Ubah"
              @click="edit(node)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              aria-label="Hapus"
              @click="remove(node)"
            />
          </template>
        </li>
      </ul>
    </UCard>
    <FormSlideover
      v-model:open="open"
      :title="editing ? `Ubah ${editing.label}` : 'Menu baru'"
      :loading="saving"
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          label="Label"
          required
        >
          <UInput
            v-model="form.label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Slug"
          :description="editing ? 'Slug tetap (jadi id menu).' : 'huruf kecil dan tanda hubung'"
        >
          <UInput
            v-model="form.slug"
            :disabled="Boolean(editing)"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Induk">
          <USelect
            v-model="form.parentId"
            :items="parentItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Alamat"
          description="Kosongkan untuk judul bagian atau grup."
        >
          <UInput
            v-model="form.path"
            placeholder="/admin/…"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Ikon"
          description="Nama ikon, misalnya i-lucide-users."
        >
          <UInput
            v-model="form.icon"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Hak akses">
          <USelect
            v-model="form.permissionKey"
            :items="permissionItems"
            class="w-full"
          />
        </UFormField>
        <USwitch
          v-model="form.isActive"
          label="Aktif"
        />
      </div>
    </FormSlideover>
  </div>
</template>
