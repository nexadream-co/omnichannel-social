<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { TAG_BREADTH_LABELS, TAG_BREADTHS, TAG_NICHE_LABELS, TAG_NICHES, TAG_STATUS_LABELS, TAG_STATUSES, type TagBreadth, type TagNiche, type TagStatus } from '#shared/hashtags/types'

interface Row { id: string, tag: string, niche: TagNiche, keywords: string[], breadth: TagBreadth, status: TagStatus, platforms: string[], notes: string | null }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Daftar tagar' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('hashtags.write'))
const niche = ref<TagNiche | 'all'>('all')
const status = ref<TagStatus | 'all'>('all')
const filters = computed(() => ({ niche: niche.value === 'all' ? undefined : niche.value, status: status.value === 'all' ? undefined : status.value }))
const list = useServerList<Row>('/api/admin/hashtags', { filters, limit: 25 })
onMounted(list.refresh)

const nicheItems = TAG_NICHES.map(value => ({ value, label: TAG_NICHE_LABELS[value] }))
const statusItems = TAG_STATUSES.map(value => ({ value, label: TAG_STATUS_LABELS[value] }))
const breadthItems = TAG_BREADTHS.map(value => ({ value, label: TAG_BREADTH_LABELS[value] }))
const STATUS_COLOR = { recommended: 'success', generic: 'warning', blocked: 'error' } as const
const columns: TableColumn<Row>[] = [
  { accessorKey: 'tag', header: 'Tagar' },
  { accessorKey: 'niche', header: 'Niche' },
  { accessorKey: 'breadth', header: 'Cakupan' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'keywords', header: 'Kata kunci' },
  { accessorKey: 'actions', header: '' }
]

function keywordPreview(keywords: string[]) {
  if (!keywords.length) return '–'
  return keywords.length > 5 ? `${keywords.slice(0, 5).join(', ')} +${keywords.length - 5}` : keywords.join(', ')
}

const open = ref(false)
const editing = ref<Row | null>(null)
const form = reactive({ tag: '', niche: 'general' as TagNiche, keywords: '', breadth: 'niche' as TagBreadth, status: 'recommended' as TagStatus, notes: '' })
const saving = ref(false)
function edit(row: Row | null) {
  editing.value = row
  Object.assign(form, row
    ? { tag: row.tag, niche: row.niche, keywords: row.keywords.join(', '), breadth: row.breadth, status: row.status, notes: row.notes ?? '' }
    : { tag: '', niche: niche.value === 'all' ? 'general' : niche.value, keywords: '', breadth: 'niche', status: 'recommended', notes: '' })
  open.value = true
}
async function save() {
  saving.value = true
  try {
    const body = {
      tag: form.tag, niche: form.niche, breadth: form.breadth, status: form.status, notes: form.notes.trim() || null,
      keywords: form.keywords.split(/[,\n]/).map(word => word.trim()).filter(Boolean)
    }
    if (editing.value) await apiFetch(`/api/admin/hashtags/${editing.value.id}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/hashtags', { method: 'POST', body })
    open.value = false
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Tagar gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Daftar tagar"
      description="Sumber saran tagar dan cek kualitas di halaman Buat Postingan. Tagar tidak dihapus: ubah statusnya ke &quot;Terlalu umum&quot; atau &quot;Diblokir&quot; supaya tetap dikenali."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Tagar baru"
        @click="edit(null)"
      />
    </CommandBar>
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari tagar atau kata kunci"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="niche"
        :items="[{ value: 'all', label: 'Semua niche' }, ...nicheItems]"
        class="w-48"
      />
      <USelect
        v-model="status"
        :items="[{ value: 'all', label: 'Semua status' }, ...statusItems]"
        class="w-44"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada tagar."
      >
        <template #tag-cell="{ row }">
          <span class="font-medium">#{{ row.original.tag }}</span>
        </template>
        <template #niche-cell="{ row }">
          {{ TAG_NICHE_LABELS[row.original.niche] ?? row.original.niche }}
        </template>
        <template #breadth-cell="{ row }">
          {{ TAG_BREADTH_LABELS[row.original.breadth] }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            size="sm"
            :color="STATUS_COLOR[row.original.status]"
            variant="subtle"
            :label="TAG_STATUS_LABELS[row.original.status]"
          />
        </template>
        <template #keywords-cell="{ row }">
          <span class="text-xs text-muted">{{ keywordPreview(row.original.keywords) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              v-if="canWrite"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="Ubah"
              @click="edit(row.original)"
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
    <FormSlideover
      v-model:open="open"
      :title="editing ? `Ubah #${editing.tag}` : 'Tagar baru'"
      :loading="saving"
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          label="Tagar"
          description="Tanpa # dan tanpa spasi. Disimpan dalam huruf kecil."
          required
        >
          <UInput
            v-model="form.tag"
            icon="i-lucide-hash"
            class="w-full"
          />
        </UFormField>
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField label="Niche">
            <USelect
              v-model="form.niche"
              :items="nicheItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Cakupan">
            <USelect
              v-model="form.breadth"
              :items="breadthItems"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Status"
          description="Terlalu umum: tidak disarankan, dan diberi peringatan. Diblokir: tidak disarankan, dan ditandai merah."
        >
          <USelect
            v-model="form.status"
            :items="statusItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Kata kunci"
          description="Kata di caption yang membuat tagar ini cocok, dipisah koma. Contoh: sunscreen, spf, sunblock."
        >
          <UTextarea
            v-model="form.keywords"
            :rows="3"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Catatan internal">
          <UInput
            v-model="form.notes"
            class="w-full"
          />
        </UFormField>
      </div>
    </FormSlideover>
  </div>
</template>
