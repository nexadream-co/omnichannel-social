<script setup lang="ts">
import { countTags } from '#shared/hashtags/parse'

/**
 * Postingan → Template: the creator's saved captions (hashtags and product links included) in one place, with a few
 * starters from sign-up. "Pakai" opens Buat Postingan with the caption filled in; the same list is "Template saya"
 * inside Buat Postingan (PostTemplatesSheet). Free on every plan.
 */
interface PostTemplate { id: string, name: string, caption: string, updatedAt: string }

definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const { confirm } = useConfirmDialog()
useHead({ title: () => t('postTemplates.pageTitle') })

const canWrite = computed(() => auth.hasAbility('posts.write'))
const templates = ref<PostTemplate[] | null>(null)
const failed = ref(false)
async function load() {
  failed.value = false
  try {
    templates.value = (await apiFetch<{ items: PostTemplate[] }>('/api/app/post-templates')).items
  } catch {
    failed.value = true
  }
}
onMounted(load)

const LINK = /https?:\/\/\S+/gi
function summary(template: PostTemplate) {
  const parts: string[] = []
  const tags = countTags(template.caption)
  const links = new Set(template.caption.match(LINK) ?? []).size
  if (tags) parts.push(t('postTemplates.tags', { n: tags }))
  if (links) parts.push(t('postTemplates.links', { n: links }))
  return parts.join(' · ')
}
const useTo = (template: PostTemplate) => localePath({ path: '/app/compose', query: { template: template.id } })

// One sheet for "Template baru" and "Ubah".
const editorOpen = ref(false)
const editing = ref<PostTemplate | null>(null)
const form = reactive({ name: '', caption: '' })
const saving = ref(false)
const canSave = computed(() => Boolean(form.name.trim() && form.caption.trim()))
function openEditor(template: PostTemplate | null) {
  editing.value = template
  form.name = template?.name ?? ''
  form.caption = template?.caption ?? ''
  editorOpen.value = true
}
async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const body = { name: form.name, caption: form.caption }
    if (editing.value) {
      const updated = await apiFetch<PostTemplate>(`/api/app/post-templates/${editing.value.id}`, { method: 'PATCH', body })
      templates.value = [updated, ...(templates.value ?? []).filter(item => item.id !== updated.id)]
    } else {
      const created = await apiFetch<PostTemplate>('/api/app/post-templates', { method: 'POST', body })
      templates.value = [created, ...(templates.value ?? [])]
    }
    toast.add({ title: t('postTemplates.saved', { name: form.name.trim() }), icon: 'i-lucide-bookmark-check', color: 'success' })
    editorOpen.value = false
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
  <div class="w-full max-w-5xl mx-auto">
    <PostsHubTabs />
    <CommandBar
      :title="t('postTemplates.pageTitle')"
      :description="t('postTemplates.pageSubtitle')"
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        :label="t('postTemplates.new')"
        class="rounded-full"
        @click="openEditor(null)"
      />
    </CommandBar>

    <div
      v-if="failed"
      class="mt-6"
    >
      <EmptyState
        icon="i-lucide-cloud-off"
        :title="t('authError.generic')"
        :action="{ label: t('common.retry'), icon: 'i-lucide-rotate-cw', onClick: load }"
      />
    </div>
    <div
      v-else-if="!templates"
      class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <USkeleton
        v-for="n in 6"
        :key="n"
        class="h-44 rounded-2xl"
      />
    </div>
    <div
      v-else-if="!templates.length"
      class="mt-6"
    >
      <EmptyState
        icon="i-lucide-bookmark"
        :title="t('postTemplates.emptyTitle')"
        :description="t('postTemplates.empty')"
        :action="canWrite ? { label: t('postTemplates.new'), icon: 'i-lucide-plus', onClick: () => openEditor(null) } : undefined"
      />
    </div>
    <TransitionGroup
      v-else
      tag="ul"
      name="list"
      class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="template in templates"
        :key="template.id"
        class="flex flex-col rounded-2xl bg-default p-4 shadow-(--app-shadow-card)"
      >
        <div class="flex items-start gap-2">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-bookmark"
              class="size-4"
            />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate font-semibold text-highlighted">
              {{ template.name }}
            </h2>
            <p
              v-if="summary(template)"
              class="text-xs text-primary"
            >
              {{ summary(template) }}
            </p>
          </div>
          <UDropdownMenu
            v-if="canWrite"
            :items="[[
              { label: t('postTemplates.edit'), icon: 'i-lucide-pencil', onSelect: () => openEditor(template) },
              { label: t('postTemplates.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(template) }
            ]]"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              :aria-label="t('postTemplates.more', { name: template.name })"
            />
          </UDropdownMenu>
        </div>
        <p class="mt-3 flex-1 whitespace-pre-line text-sm text-default line-clamp-5">
          {{ template.caption }}
        </p>
        <UButton
          v-if="canWrite"
          :to="useTo(template)"
          icon="i-lucide-square-pen"
          :label="t('postTemplates.useInPost')"
          variant="soft"
          block
          class="mt-4 rounded-full"
        />
      </li>
    </TransitionGroup>

    <ResponsiveSheet
      v-model:open="editorOpen"
      :title="editing ? t('postTemplates.editTitle') : t('postTemplates.newTitle')"
      :description="t('postTemplates.blankHint')"
    >
      <template #body>
        <form
          id="template-form"
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField :label="t('postTemplates.name')">
            <UInput
              v-model="form.name"
              :placeholder="t('postTemplates.namePlaceholder')"
              :maxlength="40"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('composer.caption')">
            <UTextarea
              v-model="form.caption"
              :rows="8"
              autoresize
              :maxrows="16"
              :maxlength="2200"
              :placeholder="t('composer.captionPlaceholder')"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            @click="editorOpen = false"
          />
          <UButton
            type="submit"
            form="template-form"
            icon="i-lucide-bookmark-check"
            :label="t('postTemplates.save')"
            :loading="saving"
            :disabled="!canSave"
          />
        </div>
      </template>
    </ResponsiveSheet>
  </div>
</template>
