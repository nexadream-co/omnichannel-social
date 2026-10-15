<script setup lang="ts">
interface Faq { id: string, question: string, answer: string, category: string, order: number, isActive: boolean }

definePageMeta({ layout: 'admin' })
useHead({ title: 'FAQ' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('faq.write'))
const rows = ref<Faq[] | null>(null)
async function load() {
  rows.value = (await apiFetch<{ items: Faq[] }>('/api/admin/faq')).items
}
onMounted(load)
const open = ref(false)
const editing = ref<Faq | null>(null)
const form = reactive({ question: '', answer: '', category: 'umum', order: 0, isActive: true })
const saving = ref(false)
function edit(row: Faq | null) {
  editing.value = row
  Object.assign(form, row ? { ...row } : { question: '', answer: '', category: 'umum', order: rows.value?.length ?? 0, isActive: true })
  open.value = true
}
async function save() {
  saving.value = true
  try {
    const body = { question: form.question, answer: form.answer, category: form.category, order: Number(form.order), isActive: form.isActive }
    if (editing.value) await apiFetch(`/api/admin/faq/${editing.value.id}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/faq', { method: 'POST', body })
    open.value = false
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'FAQ gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function remove(row: Faq) {
  if (!await confirm({ title: 'Hapus pertanyaan ini?', description: row.question, color: 'error', confirmLabel: 'Hapus' })) return
  await apiFetch(`/api/admin/faq/${row.id}`, { method: 'DELETE' })
  await load()
}
const toggle = async (row: Faq) => {
  await apiFetch(`/api/admin/faq/${row.id}`, { method: 'PATCH', body: { isActive: !row.isActive } })
  await load()
}
</script>

<template>
  <div class="max-w-4xl">
    <CommandBar
      title="FAQ"
      description="Pertanyaan yang tampil di halaman depan, sesuai urutan."
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        label="Pertanyaan baru"
        @click="edit(null)"
      />
    </CommandBar>
    <USkeleton
      v-if="!rows"
      class="h-48 w-full"
    />
    <UCard
      v-else-if="!rows.length"
      class="text-center text-muted"
    >
      Belum ada pertanyaan.
    </UCard>
    <div
      v-else
      class="space-y-3"
    >
      <UCard
        v-for="row in rows"
        :key="row.id"
        :ui="{ body: 'p-4 sm:p-4' }"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">
              {{ row.question }}
            </p>
            <p class="text-sm text-muted mt-1 line-clamp-2 whitespace-pre-line">
              {{ row.answer }}
            </p>
            <div class="flex gap-1 mt-2">
              <UBadge
                size="sm"
                color="neutral"
                variant="subtle"
                :label="row.category"
              />
              <UBadge
                size="sm"
                color="neutral"
                variant="outline"
                :label="`urutan ${row.order}`"
              />
            </div>
          </div>
          <div
            v-if="canWrite"
            class="flex items-center gap-1 shrink-0"
          >
            <USwitch
              :model-value="row.isActive"
              aria-label="Aktif"
              @update:model-value="toggle(row)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="Ubah"
              @click="edit(row)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              aria-label="Hapus"
              @click="remove(row)"
            />
          </div>
        </div>
      </UCard>
    </div>
    <FormSlideover
      v-model:open="open"
      :title="editing ? 'Ubah pertanyaan' : 'Pertanyaan baru'"
      :loading="saving"
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          label="Pertanyaan"
          required
        >
          <UInput
            v-model="form.question"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Jawaban"
          required
        >
          <UTextarea
            v-model="form.answer"
            :rows="6"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Kategori">
            <UInput
              v-model="form.category"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Urutan">
            <UInputNumber
              v-model="form.order"
              :min="0"
              class="w-full"
            />
          </UFormField>
        </div>
        <USwitch
          v-model="form.isActive"
          label="Tampilkan"
        />
      </div>
    </FormSlideover>
  </div>
</template>
