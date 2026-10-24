<script setup lang="ts">
import type { MediaView } from '#shared/media/types'
import { CONTENT_PILLARS, IDEA_MAX_LINKS, IDEA_MAX_MEDIA, IDEA_NOTE_MAX, IDEA_TITLE_MAX, PILLAR_META, type IdeaDetail, type IdeaProduct } from '#shared/utils/planner'
import { quickDays } from '~/utils/schedule'
import type { LinkRow } from '~/pages/app/links/index.vue'

/** Create or edit one idea (Kalender, Bank Ide). An idea that became a post is read-only here. */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ idea: IdeaDetail | null, plannedOn?: string | null }>()
const emit = defineEmits<{ saved: [idea: IdeaDetail] }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const readOnly = computed(() => !canWrite.value || props.idea?.status === 'used')
const form = reactive({ title: '', note: '', plannedOn: '', pillar: 'none' as string, links: [] as IdeaProduct[], media: [] as MediaView[] })
const saving = ref(false)
const advanced = ref(false)
const productPicker = ref(false)
const mediaPicker = ref(false)

watch(open, (value) => {
  if (!value) return
  const idea = props.idea
  Object.assign(form, {
    title: idea?.title ?? '',
    note: idea?.note ?? '',
    plannedOn: idea?.plannedOn ?? props.plannedOn ?? '',
    pillar: idea?.pillar ?? 'none',
    links: [...(idea?.links ?? [])],
    media: [...(idea?.media ?? [])]
  })
  advanced.value = Boolean(idea && (idea.note || idea.pillar || idea.links.length || idea.media.length))
})

// "Tanpa tanggal · Besok · Sabtu · Pilih…": a one-line idea needs no more than this.
const today = computed(() => quickDays(planner.tzOf(), new Date(), 1)[0]!.date)
const dateChips = computed(() => {
  const days = quickDays(planner.tzOf(), new Date(), 8, locale.value === 'en' ? 'en-GB' : 'id-ID')
  const saturday = days.find(d => new Date(`${d.date}T00:00:00Z`).getUTCDay() === 6)
  return [
    { value: '', label: t('when.noDate') },
    { value: days[1]!.date, label: t('when.tomorrow') },
    ...(saturday && saturday.date !== days[1]!.date ? [{ value: saturday.date, label: t('when.weekday', { day: saturday.weekday ?? '', date: Number(saturday.date.slice(8)) }) }] : [])
  ]
})

const pillarItems = computed(() => [{ value: 'none', label: t('planner.pillarNone') }, ...CONTENT_PILLARS.map(value => ({ value, label: t(PILLAR_META[value].labelKey), icon: PILLAR_META[value].icon }))])

function addProduct(link: LinkRow) {
  if (form.links.some(l => l.id === link.id) || form.links.length >= IDEA_MAX_LINKS) return
  form.links.push({ id: link.id, title: link.title, merchant: link.merchant, imageUrl: link.imageUrl, destinationUrl: link.destinationUrl, shortUrl: link.shortUrl })
}
function addMedia(picked: MediaView[]) {
  for (const media of picked) if (!form.media.some(m => m.id === media.id)) form.media.push(media)
  form.media = form.media.slice(0, IDEA_MAX_MEDIA)
}

const body = () => ({
  title: form.title,
  note: form.note.trim() || null,
  plannedOn: form.plannedOn || null,
  pillar: form.pillar === 'none' ? null : form.pillar,
  linkIds: form.links.map(l => l.id),
  mediaIds: form.media.map(m => m.id)
})

async function save(): Promise<IdeaDetail | null> {
  if (readOnly.value) {
    open.value = false
    return props.idea
  }
  saving.value = true
  try {
    const saved = props.idea
      ? await apiFetch<IdeaDetail>(`/api/app/planner/ideas/${props.idea.id}`, { method: 'PATCH', body: body() })
      : await apiFetch<IdeaDetail>('/api/app/planner/ideas', { method: 'POST', body: body() })
    useToast().add({ title: t('planner.idea.saved'), color: 'success' })
    emit('saved', saved)
    open.value = false
    return saved
  } catch (caught) {
    planner.fail(caught)
    return null
  } finally {
    saving.value = false
  }
}

/** Saves first, so nothing typed here is lost on the way to the composer. */
async function toPost() {
  const saved = await save()
  if (saved) await planner.toPost(saved.id)
}

async function archive() {
  if (props.idea && await planner.archiveIdea(props.idea.id)) open.value = false
}
async function restore() {
  if (props.idea && await planner.restoreIdea(props.idea.id)) open.value = false
}
</script>

<template>
  <FormSlideover
    v-model:open="open"
    :title="idea ? t('planner.idea.edit') : t('planner.idea.new')"
    :loading="saving"
    :submit-label="readOnly ? t('common.close') : t('common.save')"
    @submit="save"
  >
    <div class="space-y-5">
      <UAlert
        v-if="idea?.status === 'used' && idea.postId"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="t('planner.bank.views.used')"
        :actions="[{ label: t('planner.idea.openPost'), to: localePath(`/app/posts/${idea.postId}`), color: 'success', variant: 'solid', size: 'xs' }]"
      />
      <UFormField
        :label="t('planner.idea.title')"
        :description="t('planner.idea.titleHint')"
        required
      >
        <UTextarea
          v-model="form.title"
          :rows="2"
          autoresize
          :maxlength="IDEA_TITLE_MAX"
          :disabled="readOnly"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('planner.idea.date')"
      >
        <CalendarDayChips
          v-model="form.plannedOn"
          :chips="dateChips"
          :min="idea ? undefined : today"
          :disabled="readOnly"
        />
      </UFormField>

      <UCollapsible
        v-model:open="advanced"
        :ui="{ content: 'pt-4' }"
      >
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          class="px-0"
          :trailing-icon="advanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="t('planner.idea.advanced')"
        />
        <template #content>
          <div class="space-y-5">
            <UFormField :label="t('planner.idea.note')">
              <UTextarea
                v-model="form.note"
                :rows="3"
                autoresize
                :maxlength="IDEA_NOTE_MAX"
                :placeholder="t('planner.idea.notePlaceholder')"
                :disabled="readOnly"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('planner.pillarLabel')"
              :description="t('planner.pillarHint')"
            >
              <USelect
                v-model="form.pillar"
                :items="pillarItems"
                :disabled="readOnly"
                class="w-full"
              />
            </UFormField>

            <div>
              <p class="text-sm font-medium mb-2">
                {{ t('planner.idea.products') }}
              </p>
              <ul
                v-if="form.links.length"
                class="space-y-2 mb-2"
              >
                <li
                  v-for="link in form.links"
                  :key="link.id"
                  class="flex items-center gap-2 rounded-md border border-default px-2 py-1.5"
                >
                  <UAvatar
                    :src="link.imageUrl ?? undefined"
                    icon="i-lucide-shopping-bag"
                    size="sm"
                  />
                  <span class="text-sm truncate flex-1">{{ link.title || link.destinationUrl }}</span>
                  <UButton
                    v-if="!readOnly"
                    icon="i-lucide-x"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('common.remove')"
                    @click="form.links = form.links.filter(l => l.id !== link.id)"
                  />
                </li>
              </ul>
              <UButton
                v-if="!readOnly && form.links.length < IDEA_MAX_LINKS"
                size="sm"
                variant="soft"
                icon="i-lucide-link"
                :label="t('planner.idea.addProduct')"
                @click="productPicker = true"
              />
            </div>

            <div>
              <p class="text-sm font-medium mb-2">
                {{ t('planner.idea.media') }}
              </p>
              <div
                v-if="form.media.length"
                class="grid grid-cols-4 gap-2 mb-2"
              >
                <div
                  v-for="media in form.media"
                  :key="media.id"
                  class="relative aspect-square rounded-md overflow-hidden bg-muted"
                >
                  <SmartImage
                    :src="media.kind === 'image' ? media.url : media.posterUrl"
                    kind="media"
                    class="size-full"
                  />
                  <UIcon
                    v-if="media.kind === 'video'"
                    name="i-lucide-play"
                    class="absolute bottom-1 left-1 size-4 text-white drop-shadow"
                  />
                  <UButton
                    v-if="!readOnly"
                    icon="i-lucide-x"
                    size="xs"
                    color="neutral"
                    variant="solid"
                    class="absolute top-1 right-1"
                    :aria-label="t('common.remove')"
                    @click="form.media = form.media.filter(m => m.id !== media.id)"
                  />
                </div>
              </div>
              <UButton
                v-if="!readOnly && form.media.length < IDEA_MAX_MEDIA"
                size="sm"
                variant="soft"
                icon="i-lucide-images"
                :label="t('planner.idea.addMedia')"
                @click="mediaPicker = true"
              />
            </div>
          </div>
        </template>
      </UCollapsible>

      <div
        v-if="canWrite && idea?.status !== 'used'"
        class="flex flex-wrap gap-2 pt-2 border-t border-default"
      >
        <UButton
          v-if="idea?.status !== 'archived'"
          icon="i-lucide-square-pen"
          color="neutral"
          variant="outline"
          :label="t('planner.idea.toPost')"
          :loading="saving"
          @click="toPost"
        />
        <UButton
          v-if="idea?.status === 'open'"
          icon="i-lucide-archive"
          color="neutral"
          variant="ghost"
          :label="t('planner.idea.archive')"
          @click="archive"
        />
        <UButton
          v-if="idea?.status === 'archived'"
          icon="i-lucide-archive-restore"
          color="neutral"
          variant="outline"
          :label="t('planner.idea.restore')"
          @click="restore"
        />
      </div>
    </div>
    <ProductLinkPicker
      v-model:open="productPicker"
      @pick="addProduct"
    />
    <MediaLibraryPicker
      v-model:open="mediaPicker"
      :max="IDEA_MAX_MEDIA - form.media.length"
      @pick="addMedia"
    />
  </FormSlideover>
</template>
