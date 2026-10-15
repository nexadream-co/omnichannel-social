<script setup lang="ts">
import type { TemplateVariable } from '#shared/utils/templates'

interface EmailTemplateRow { id: string, key: string, name: string, description: string | null, subject: string, body: string, variables: TemplateVariable[], isActive: boolean, updatedAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Templat email' })

const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('email-templates.write'))
const items = ref<EmailTemplateRow[]>([])
const loading = ref(true)
const search = ref('')

async function load() {
  items.value = (await apiFetch<{ items: EmailTemplateRow[] }>('/api/admin/email-templates')).items
  loading.value = false
}
onMounted(load)

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return term ? items.value.filter(row => row.name.toLowerCase().includes(term) || row.subject.toLowerCase().includes(term)) : items.value
})

const open = ref(false)
const editing = ref<EmailTemplateRow | null>(null)
const form = reactive({ subject: '', body: '', isActive: true })
const saving = ref(false)
const preview = ref<{ subject: string, html: string } | null>(null)
const bodyRef = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('body')

function edit(row: EmailTemplateRow) {
  editing.value = row
  Object.assign(form, { subject: row.subject, body: row.body, isActive: row.isActive })
  open.value = true
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(() => [form.subject, form.body, open.value], () => {
  if (!open.value || !editing.value) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    preview.value = await apiFetch<{ subject: string, html: string }>('/api/admin/email-templates/preview', {
      method: 'POST', body: { subject: form.subject, body: form.body, variables: editing.value!.variables }
    }).catch(() => null)
  }, 300)
})

function insertToken(token: string) {
  const placeholder = `{{${token}}}`
  const area = bodyRef.value?.textareaRef
  if (!area) {
    form.body += placeholder
    return
  }
  const start = area.selectionStart ?? form.body.length
  form.body = form.body.slice(0, start) + placeholder + form.body.slice(area.selectionEnd ?? start)
}

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    await apiFetch(`/api/admin/email-templates/${editing.value.id}`, { method: 'PATCH', body: { ...form } })
    toast.add({ title: 'Templat disimpan.', color: 'success' })
    open.value = false
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Templat gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <CommandBar
      title="Templat email"
      description="Isi email yang dikirim ke kreator dan staf. Kunci templat dibuat oleh sistem."
    />
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Cari templat…"
      class="mb-4 w-full sm:w-80"
    />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        v-if="loading"
        class="p-6 space-y-3"
      >
        <USkeleton
          v-for="n in 6"
          :key="n"
          class="h-10 w-full"
        />
      </div>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="row in filtered"
          :key="row.id"
          class="px-4 py-3 flex items-center gap-4"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted truncate">
              {{ row.name }}
            </p>
            <p class="text-sm text-muted truncate">
              {{ row.subject }}
            </p>
          </div>
          <UBadge
            :color="row.isActive ? 'success' : 'neutral'"
            variant="subtle"
            :label="row.isActive ? 'Aktif' : 'Nonaktif'"
          />
          <UButton
            :icon="canWrite ? 'i-lucide-pencil' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            :aria-label="canWrite ? 'Ubah' : 'Lihat'"
            @click="edit(row)"
          />
        </li>
      </ul>
    </UCard>

    <FormSlideover
      v-model:open="open"
      :title="editing?.name ?? ''"
      :description="editing?.description ?? undefined"
      :loading="saving"
      wide
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          label="Subjek"
          name="subject"
        >
          <UInput
            v-model="form.subject"
            :disabled="!canWrite"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Isi (HTML)"
          name="body"
          description="Klik variabel untuk menyisipkannya di posisi kursor."
        >
          <div class="flex flex-wrap gap-1 mb-2">
            <UButton
              v-for="variable in editing?.variables ?? []"
              :key="variable.token"
              size="xs"
              color="neutral"
              variant="soft"
              :label="variable.label"
              :disabled="!canWrite"
              @click="insertToken(variable.token)"
            />
          </div>
          <UTextarea
            ref="body"
            v-model="form.body"
            :rows="10"
            autoresize
            :disabled="!canWrite"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
          />
        </UFormField>
        <USwitch
          v-model="form.isActive"
          :disabled="!canWrite"
          label="Aktif"
          description="Jika nonaktif, email ini tidak dikirim sama sekali."
        />
        <div>
          <p class="text-sm font-medium mb-2">
            Pratinjau
          </p>
          <p
            v-if="preview"
            class="text-sm text-muted mb-2"
          >
            Subjek: <span class="text-default">{{ preview.subject }}</span>
          </p>
          <iframe
            v-if="preview"
            :srcdoc="preview.html"
            sandbox=""
            title="Pratinjau email"
            class="w-full h-96 rounded-md border border-default bg-white"
          />
        </div>
      </div>
    </FormSlideover>
  </div>
</template>
