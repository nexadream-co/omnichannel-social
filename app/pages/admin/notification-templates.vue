<script setup lang="ts">
interface NotificationTemplateRow { id: string, key: string, name: string, title: string, body: string, actionLabel: string | null, actionUrl: string | null, icon: string | null, level: 'info' | 'success' | 'warning' | 'error', isActive: boolean }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Templat notifikasi' })

const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('notification-templates.write'))
const items = ref<NotificationTemplateRow[]>([])
const loading = ref(true)

const LEVELS = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Berhasil' },
  { value: 'warning', label: 'Peringatan' },
  { value: 'error', label: 'Galat' }
]
const LEVEL_CLASS = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' } as const

async function load() {
  items.value = (await apiFetch<{ items: NotificationTemplateRow[] }>('/api/admin/notification-templates')).items
  loading.value = false
}
onMounted(load)

const open = ref(false)
const editing = ref<NotificationTemplateRow | null>(null)
const form = reactive({ title: '', body: '', actionLabel: '', actionUrl: '', icon: '', level: 'info' as NotificationTemplateRow['level'], isActive: true })
const saving = ref(false)

function edit(row: NotificationTemplateRow) {
  editing.value = row
  Object.assign(form, { title: row.title, body: row.body, actionLabel: row.actionLabel ?? '', actionUrl: row.actionUrl ?? '', icon: row.icon ?? '', level: row.level, isActive: row.isActive })
  open.value = true
}

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    await apiFetch(`/api/admin/notification-templates/${editing.value.id}`, {
      method: 'PATCH',
      body: { ...form, actionLabel: form.actionLabel || null, actionUrl: form.actionUrl || null, icon: form.icon || null }
    })
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
      title="Templat notifikasi"
      description="Teks notifikasi lonceng di aplikasi."
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
          v-for="row in items"
          :key="row.id"
          class="px-4 py-3 flex items-center gap-3"
        >
          <UIcon
            :name="row.icon || 'i-lucide-bell'"
            class="size-5 shrink-0"
            :class="LEVEL_CLASS[row.level]"
          />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted truncate">
              {{ row.name }}
            </p>
            <p class="text-sm text-muted truncate">
              {{ row.title }}
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
      :loading="saving"
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          label="Judul"
          name="title"
        >
          <UInput
            v-model="form.title"
            :disabled="!canWrite"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Isi"
          name="body"
        >
          <UTextarea
            v-model="form.body"
            :rows="3"
            autoresize
            :disabled="!canWrite"
            class="w-full"
          />
        </UFormField>
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            label="Label tombol"
            name="actionLabel"
          >
            <UInput
              v-model="form.actionLabel"
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Tautan tombol"
            name="actionUrl"
          >
            <UInput
              v-model="form.actionUrl"
              :disabled="!canWrite"
              class="w-full"
              placeholder="/app/…"
            />
          </UFormField>
          <UFormField
            label="Ikon"
            name="icon"
          >
            <UInput
              v-model="form.icon"
              :disabled="!canWrite"
              class="w-full"
              placeholder="i-lucide-bell"
            />
          </UFormField>
          <UFormField
            label="Tingkat"
            name="level"
          >
            <USelect
              v-model="form.level"
              :items="LEVELS"
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>
        </div>
        <USwitch
          v-model="form.isActive"
          :disabled="!canWrite"
          label="Aktif"
          description="Jika nonaktif, sistem memakai teks bawaan."
        />
        <p class="text-xs text-muted">
          Variabel ditulis seperti {{ '{' }}{{ '{' }}nama{{ '}' }}{{ '}' }}. Kunci: {{ editing?.key }}
        </p>
      </div>
    </FormSlideover>
  </div>
</template>
