<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })
const route = useRoute()
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const id = String(route.params.id)
const isNew = id === 'new'
const canWrite = computed(() => auth.hasPermission('pages.write'))
const form = reactive({ slug: '', title: '', content: '<p></p>', excerpt: '', metaTitle: '', metaDescription: '', isPublished: true })
const locked = ref(false)
const loaded = ref(isNew)
useHead({ title: () => form.title || 'Halaman' })
onMounted(async () => {
  if (isNew) return
  const page = await apiFetch<typeof form & { locked: boolean }>(`/api/admin/pages/${id}`)
  Object.assign(form, { ...page, excerpt: page.excerpt ?? '', metaTitle: page.metaTitle ?? '', metaDescription: page.metaDescription ?? '' })
  locked.value = page.locked
  loaded.value = true
})

const toolbar: EditorToolbarItem[][] = [
  [{ 'kind': 'heading', 'level': 2, 'icon': 'i-lucide-heading-2', 'aria-label': 'Judul' }, { 'kind': 'heading', 'level': 3, 'icon': 'i-lucide-heading-3', 'aria-label': 'Subjudul' }],
  [{ 'kind': 'mark', 'mark': 'bold', 'icon': 'i-lucide-bold', 'aria-label': 'Tebal' }, { 'kind': 'mark', 'mark': 'italic', 'icon': 'i-lucide-italic', 'aria-label': 'Miring' }, { 'kind': 'link', 'icon': 'i-lucide-link', 'aria-label': 'Tautan' }],
  [{ 'kind': 'bulletList', 'icon': 'i-lucide-list', 'aria-label': 'Daftar' }, { 'kind': 'orderedList', 'icon': 'i-lucide-list-ordered', 'aria-label': 'Daftar bernomor' }, { 'kind': 'blockquote', 'icon': 'i-lucide-text-quote', 'aria-label': 'Kutipan' }],
  [{ 'kind': 'undo', 'icon': 'i-lucide-undo', 'aria-label': 'Urungkan' }, { 'kind': 'redo', 'icon': 'i-lucide-redo', 'aria-label': 'Ulangi' }]
]

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const body = { slug: form.slug, title: form.title, content: form.content, excerpt: form.excerpt || null, metaTitle: form.metaTitle || null, metaDescription: form.metaDescription || null, isPublished: form.isPublished }
    if (isNew) {
      const created = await apiFetch<{ id: string }>('/api/admin/pages', { method: 'POST', body })
      toast.add({ title: 'Halaman dibuat.', color: 'success' })
      await navigateTo(`/admin/pages/${created.id}`, { replace: true })
    } else {
      await apiFetch(`/api/admin/pages/${id}`, { method: 'PATCH', body })
      toast.add({ title: 'Halaman disimpan. Isinya sudah dibersihkan dari kode berbahaya.', color: 'success' })
    }
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Halaman gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (!await confirm({ title: `Hapus ${form.title}?`, color: 'error', confirmLabel: 'Hapus' })) return
  try {
    await apiFetch(`/api/admin/pages/${id}`, { method: 'DELETE' })
    await navigateTo('/admin/pages')
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Halaman gagal dihapus.'), color: 'error' })
  }
}
</script>

<template>
  <div class="max-w-4xl space-y-4">
    <CommandBar
      :title="isNew ? 'Halaman baru' : form.title"
      :description="isNew ? undefined : `/page/${form.slug}`"
    >
      <UButton
        to="/admin/pages"
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        label="Semua halaman"
      />
      <UButton
        v-if="!isNew && !locked && canWrite"
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        label="Hapus"
        @click="remove"
      />
      <UButton
        v-if="canWrite"
        icon="i-lucide-save"
        label="Simpan"
        :loading="saving"
        @click="save"
      />
    </CommandBar>
    <USkeleton
      v-if="!loaded"
      class="h-96 w-full"
    />
    <template v-else>
      <UAlert
        v-if="locked"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        title="Halaman ini wajib selalu terbit (review Meta). Slug dan status terbit dikunci."
      />
      <UCard>
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <UFormField
              label="Judul"
              required
            >
              <UInput
                v-model="form.title"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Slug">
              <UInput
                v-model="form.slug"
                :disabled="locked"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="Isi">
            <div class="rounded-md border border-default">
              <UEditor
                v-slot="{ editor }"
                v-model="form.content"
                content-type="html"
                :editable="canWrite"
                class="min-h-80 px-4 py-3"
                placeholder="Tulis isi halaman…"
              >
                <UEditorToolbar
                  :editor="editor"
                  :items="toolbar"
                  class="border-b border-default -mx-4 -mt-3 mb-3 px-2 py-1 sticky top-0 bg-default z-10"
                />
              </UEditor>
            </div>
          </UFormField>
          <UCollapsible>
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-between px-0"
              label="SEO dan ringkasan"
              trailing-icon="i-lucide-chevron-down"
            />
            <template #content>
              <div class="space-y-4 pt-3">
                <UFormField label="Ringkasan">
                  <UTextarea
                    v-model="form.excerpt"
                    :rows="2"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Judul SEO"
                  :hint="`${form.metaTitle.length}/70`"
                >
                  <UInput
                    v-model="form.metaTitle"
                    :maxlength="70"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Deskripsi SEO"
                  :hint="`${form.metaDescription.length}/170`"
                >
                  <UTextarea
                    v-model="form.metaDescription"
                    :maxlength="170"
                    :rows="2"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </template>
          </UCollapsible>
          <USwitch
            v-model="form.isPublished"
            :disabled="locked"
            label="Terbit"
          />
        </div>
      </UCard>
    </template>
  </div>
</template>
