<script setup lang="ts">
import { countTags } from '#shared/hashtags/parse'

/**
 * "Template saya" in Buat Postingan: captions the creator saved (hashtags and product short links included, as
 * written) to start a post from, and "Simpan caption ini" to add one. Free on every plan.
 */
interface PostTemplate { id: string, name: string, caption: string }

const open = defineModel<boolean>('open', { default: false })
const caption = defineModel<string>('caption', { required: true })
const { t } = useI18n()
const toast = useToast()
const { confirm, choose } = useConfirmDialog()

const templates = ref<PostTemplate[] | null>(null)
async function load() {
  templates.value = (await apiFetch<{ items: PostTemplate[] }>('/api/app/post-templates').catch(() => ({ items: [] }))).items
}
watch(open, (isOpen) => {
  if (isOpen && !templates.value) load()
})

const LINK = /https?:\/\/\S+/gi
const linkCount = (text: string) => new Set(text.match(LINK) ?? []).size
function summary(template: PostTemplate) {
  const parts: string[] = []
  const tags = countTags(template.caption)
  const links = linkCount(template.caption)
  if (tags) parts.push(t('postTemplates.tags', { n: tags }))
  if (links) parts.push(t('postTemplates.links', { n: links }))
  return parts.join(' · ')
}

/** An empty caption takes the template as is; otherwise the creator picks: replace, or add it under what's there. */
async function use(template: PostTemplate) {
  if (caption.value.trim()) {
    const answer = await choose({
      title: t('postTemplates.replaceTitle'),
      description: t('postTemplates.replaceBody'),
      confirmLabel: t('postTemplates.replace'),
      extraLabel: t('postTemplates.append'),
      extraIcon: 'i-lucide-text-cursor-input'
    })
    if (answer === 'cancel') return
    caption.value = answer === 'confirm' ? template.caption : `${caption.value.trimEnd()}\n\n${template.caption}`
  } else {
    caption.value = template.caption
  }
  open.value = false
  toast.add({ title: t('postTemplates.used', { name: template.name }), icon: 'i-lucide-bookmark-check', color: 'success' })
}

const name = ref('')
const saving = ref(false)
const canSave = computed(() => Boolean(caption.value.trim() && name.value.trim()))
async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const created = await apiFetch<PostTemplate>('/api/app/post-templates', { method: 'POST', body: { name: name.value, caption: caption.value } })
    templates.value = [created, ...(templates.value ?? [])]
    name.value = ''
    toast.add({ title: t('postTemplates.saved', { name: created.name }), icon: 'i-lucide-bookmark-plus', color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(template: PostTemplate) {
  if (!(await confirm({ title: t('postTemplates.deleteTitle', { name: template.name }), description: t('postTemplates.deleteBody'), confirmLabel: t('postTemplates.delete'), color: 'error' }))) return
  try {
    await apiFetch(`/api/app/post-templates/${template.id}`, { method: 'DELETE' })
    templates.value = (templates.value ?? []).filter(item => item.id !== template.id)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('postTemplates.title')"
    :description="t('postTemplates.description')"
  >
    <template #body>
      <form
        class="rounded-xl bg-primary/8 p-3 space-y-2"
        @submit.prevent="save"
      >
        <p class="text-sm font-medium text-highlighted">
          {{ t('postTemplates.saveTitle') }}
        </p>
        <p
          v-if="!caption.trim()"
          class="text-xs text-muted"
        >
          {{ t('postTemplates.saveEmpty') }}
        </p>
        <div class="flex gap-2">
          <UInput
            v-model="name"
            :placeholder="t('postTemplates.namePlaceholder')"
            :maxlength="40"
            :disabled="!caption.trim()"
            class="flex-1"
          />
          <UButton
            type="submit"
            icon="i-lucide-bookmark-plus"
            :label="t('postTemplates.save')"
            :loading="saving"
            :disabled="!canSave"
          />
        </div>
      </form>

      <div class="mt-4">
        <div
          v-if="!templates"
          class="space-y-2"
        >
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-16 w-full"
          />
        </div>
        <div
          v-else-if="!templates.length"
          class="py-6 text-center"
        >
          <UIcon
            name="i-lucide-bookmark"
            class="size-8 text-primary mx-auto"
          />
          <p class="mt-2 text-sm text-default">
            {{ t('postTemplates.empty') }}
          </p>
        </div>
        <TransitionGroup
          v-else
          tag="ul"
          name="list"
          class="space-y-2"
        >
          <li
            v-for="template in templates"
            :key="template.id"
            class="flex items-start gap-2 rounded-xl bg-elevated/70 p-3 motion-safe:transition-colors hover:bg-elevated"
          >
            <button
              type="button"
              class="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              @click="use(template)"
            >
              <span class="block text-sm font-semibold text-highlighted truncate">{{ template.name }}</span>
              <span class="mt-0.5 block text-xs text-muted line-clamp-2">{{ template.caption.replace(/\s+/g, ' ') }}</span>
              <span
                v-if="summary(template)"
                class="mt-1 block text-xs text-primary"
              >{{ summary(template) }}</span>
            </button>
            <UButton
              :label="t('postTemplates.use')"
              size="xs"
              variant="soft"
              @click="use(template)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              color="neutral"
              variant="ghost"
              square
              :aria-label="t('postTemplates.deleteTitle', { name: template.name })"
              @click="remove(template)"
            />
          </li>
        </TransitionGroup>
      </div>
    </template>
  </ResponsiveSheet>
</template>
