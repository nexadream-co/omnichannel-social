<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { MOMENT_KIND_META, MOMENT_KINDS, type MomentKind } from '#shared/utils/planner'

interface Row { id: string, name: string, nameEn: string | null, kind: MomentKind, startsOn: string, endsOn: string, prepDays: number, isActive: boolean }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Momen belanja' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('moments.write'))
const when = ref<'upcoming' | 'all'>('upcoming')
const filters = computed(() => ({ when: when.value }))
const list = useServerList<Row>('/api/admin/moments', { filters, limit: 25 })
onMounted(list.refresh)

const kindItems = MOMENT_KINDS.map(value => ({ value, label: MOMENT_KIND_META[value].label }))
const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Momen' },
  { accessorKey: 'kind', header: 'Jenis' },
  { accessorKey: 'startsOn', header: 'Tanggal' },
  { accessorKey: 'prepDays', header: 'Persiapan' },
  { accessorKey: 'isActive', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

const day = (value: string) => formatDate(`${value}T12:00:00Z`, { locale: 'id', timeZone: 'UTC' })
const range = (row: Row) => row.endsOn === row.startsOn ? day(row.startsOn) : `${day(row.startsOn)} – ${day(row.endsOn)}`

const open = ref(false)
const editing = ref<Row | null>(null)
const form = reactive({ name: '', nameEn: '', kind: 'campaign' as MomentKind, startsOn: '', endsOn: '', prepDays: 3, isActive: true })
const saving = ref(false)
function edit(row: Row | null) {
  editing.value = row
  Object.assign(form, row
    ? { name: row.name, nameEn: row.nameEn ?? '', kind: row.kind, startsOn: row.startsOn, endsOn: row.endsOn, prepDays: row.prepDays, isActive: row.isActive }
    : { name: '', nameEn: '', kind: 'campaign', startsOn: '', endsOn: '', prepDays: 3, isActive: true })
  open.value = true
}
async function save() {
  saving.value = true
  try {
    const body = { ...form, nameEn: form.nameEn.trim() || null, endsOn: form.endsOn || form.startsOn, prepDays: Number(form.prepDays) }
    if (editing.value) await apiFetch(`/api/admin/moments/${editing.value.id}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/moments', { method: 'POST', body })
    open.value = false
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Momen gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Momen belanja"
      description="Tanggal belanja yang muncul di Kalender kreator, lengkap dengan tombol &quot;Siapkan konten&quot;. Momen tidak dihapus: matikan saja kalau salah, karena ide kreator bisa merujuk ke sana."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Momen baru"
        @click="edit(null)"
      />
    </CommandBar>
    <div class="flex flex-wrap gap-3 mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nama momen"
        class="flex-1 min-w-56"
      />
      <USelect
        v-model="when"
        :items="[{ value: 'upcoming', label: 'Mendatang dan berlangsung' }, { value: 'all', label: 'Semua, terbaru dulu' }]"
        class="w-60"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <AdminTable
        :data="list.items.value"
        :columns="columns"
        :loading="list.status.value === 'loading'"
        empty="Belum ada momen."
      >
        <template #name-cell="{ row }">
          <p class="font-medium">
            {{ row.original.name }}
          </p>
          <p
            v-if="row.original.nameEn"
            class="text-xs text-muted"
          >
            {{ row.original.nameEn }}
          </p>
        </template>
        <template #kind-cell="{ row }">
          <span class="flex items-center gap-1.5">
            <UIcon
              :name="MOMENT_KIND_META[row.original.kind].icon"
              class="size-4 text-muted"
            />
            {{ MOMENT_KIND_META[row.original.kind].label }}
          </span>
        </template>
        <template #startsOn-cell="{ row }">
          {{ range(row.original) }}
        </template>
        <template #prepDays-cell="{ row }">
          H-{{ row.original.prepDays }}
        </template>
        <template #isActive-cell="{ row }">
          <UBadge
            size="sm"
            variant="subtle"
            :color="row.original.isActive ? 'success' : 'neutral'"
            :label="row.original.isActive ? 'Aktif' : 'Nonaktif'"
          />
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
    <FormSlideover
      v-model:open="open"
      :title="editing ? `Ubah ${editing.name}` : 'Momen baru'"
      :loading="saving"
      @submit="save"
    >
      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            label="Nama"
            description="Yang dibaca kreator. Contoh: Promo 11.11."
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Nama (English)"
            description="Kosongkan untuk memakai nama Bahasa."
          >
            <UInput
              v-model="form.nameEn"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Jenis"
          description="Menentukan tiga ide yang dibuat &quot;Siapkan konten&quot;: tanggal kembar dan kampanye = teaser, review, hari-H."
        >
          <USelect
            v-model="form.kind"
            :items="kindItems"
            class="w-full"
          />
        </UFormField>
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            label="Mulai"
            required
          >
            <UInput
              v-model="form.startsOn"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Selesai"
            description="Kosongkan untuk momen satu hari."
          >
            <UInput
              v-model="form.endsOn"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Hari persiapan"
          description="Ide pertama ditaruh sekian hari sebelum momen dimulai."
        >
          <UInput
            v-model.number="form.prepDays"
            type="number"
            :min="1"
            :max="30"
            class="w-32"
          />
        </UFormField>
        <USwitch
          v-model="form.isActive"
          label="Tampilkan di Kalender kreator"
        />
      </div>
    </FormSlideover>
  </div>
</template>
