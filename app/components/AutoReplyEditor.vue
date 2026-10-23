<script setup lang="ts">
import { DEFAULT_PUBLIC_REPLIES, MAX_PUBLIC_REPLIES, RULE_TEMPLATES } from '#shared/utils/autoreply'
import type { LinkRow } from '~/pages/app/links/index.vue'

/** Auto-reply rule editor in three steps (docs/SCREENS.md #25): post → keywords → message + product. */
/** `linkId`: a product to fill in (from "Pasang Balas Otomatis" after scheduling a post). */
const props = defineProps<{ ruleId?: string, template?: string, linkId?: string }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const entitlements = useEntitlements()

interface Account { id: string, platform: string, username: string | null, status: string }
interface Media { externalId: string, caption: string, thumbUrl: string | null }

const accounts = ref<Account[]>([])
const media = ref<Media[]>([])
const mediaLoading = ref(false)
const loading = ref(true)
const wasActive = ref(false)
const link = ref<LinkRow | null>(null)
const fieldError = ref<string | null>(null)

const form = reactive({
  socialAccountId: '',
  name: '',
  scope: 'global' as 'post' | 'global',
  externalMediaId: null as string | null,
  keywords: ['mau'] as string[],
  matchMode: 'contains' as 'contains' | 'exact',
  dmMessage: RULE_TEMPLATES[0]!.dmMessage,
  linkId: null as string | null,
  publicReply: true,
  publicReplyVariants: [...DEFAULT_PUBLIC_REPLIES],
  dailyCap: null as number | null
})

onMounted(async () => {
  try {
    const channels = await apiFetch<{ items: Account[] }>('/api/app/channels')
    accounts.value = channels.items.filter(a => a.platform === 'instagram' && a.status !== 'revoked')
    form.socialAccountId = accounts.value[0]?.id ?? ''
    if (props.ruleId) {
      const rule = await apiFetch<{ socialAccountId: string, name: string, scope: 'post' | 'global', externalMediaId: string | null, keywords: string[], matchMode: 'contains' | 'exact', dmMessage: string, linkId: string | null, publicReplyVariants: string[], dailyCap: number | null, active: boolean }>(`/api/app/autoreply/rules/${props.ruleId}`)
      Object.assign(form, { ...rule, publicReply: rule.publicReplyVariants.length > 0, publicReplyVariants: rule.publicReplyVariants.length ? rule.publicReplyVariants : [...DEFAULT_PUBLIC_REPLIES] })
      wasActive.value = rule.active
    } else {
      const template = RULE_TEMPLATES.find(item => item.key === props.template)
      if (template) Object.assign(form, { scope: template.scope, keywords: [...template.keywords], dmMessage: template.dmMessage, publicReplyVariants: [...template.publicReplyVariants] })
      if (props.linkId) form.linkId = props.linkId
    }
    if (form.linkId) link.value = await apiFetch<LinkRow>(`/api/app/links/${form.linkId}`).catch(() => null)
  } finally {
    loading.value = false
  }
})

watch(() => [form.socialAccountId, form.scope], async () => {
  if (form.scope !== 'post' || !form.socialAccountId) return
  mediaLoading.value = true
  try {
    media.value = (await apiFetch<{ items: Media[] }>('/api/app/autoreply/media', { query: { accountId: form.socialAccountId } })).items
  } finally {
    mediaLoading.value = false
  }
})

const scopeItems = computed(() => [{ value: 'global', label: t('autoReply.allPosts') }, { value: 'post', label: t('autoReply.onePost') }])
const matchItems = computed(() => [{ value: 'contains', label: t('autoReply.matchContains') }, { value: 'exact', label: t('autoReply.matchExact') }])
const accountItems = computed(() => accounts.value.map(a => ({ value: a.id, label: `@${a.username ?? 'instagram'}` })))

const message = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('message')
function insert(token: string) {
  const el = message.value?.textareaRef
  const at = el?.selectionStart ?? form.dmMessage.length
  form.dmMessage = `${form.dmMessage.slice(0, at)}${token}${form.dmMessage.slice(at)}`
}
const pickerOpen = ref(false)
function pick(row: LinkRow) {
  link.value = row
  form.linkId = row.id
  if (!/\{link\}/i.test(form.dmMessage)) form.dmMessage = `${form.dmMessage.trimEnd()} {link}`
}

function body(active: boolean) {
  return {
    socialAccountId: form.socialAccountId,
    name: form.name || undefined,
    scope: form.scope,
    externalMediaId: form.scope === 'post' ? form.externalMediaId : null,
    keywords: form.keywords,
    matchMode: form.matchMode,
    dmMessage: form.dmMessage,
    linkId: form.linkId,
    publicReplyVariants: form.publicReply ? form.publicReplyVariants.map(v => v.trim()).filter(Boolean) : [],
    dailyCap: form.dailyCap || null,
    active
  }
}

const saving = ref<null | 'active' | 'draft'>(null)
async function save(active: boolean) {
  saving.value = active ? 'active' : 'draft'
  fieldError.value = null
  try {
    await apiFetch(props.ruleId ? `/api/app/autoreply/rules/${props.ruleId}` : '/api/app/autoreply/rules', { method: props.ruleId ? 'PUT' : 'POST', body: body(active) })
    toast.add({ title: active ? t('autoReply.activated') : t('autoReply.saved'), color: 'success' })
    await navigateTo(localePath('/app/auto-reply'))
  } catch (caught) {
    fieldError.value = extractErrorField(caught)
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = null
  }
}

// "Coba": nothing is sent.
const testOpen = ref(false)
const testComment = ref('')
const testResult = ref<{ matches: boolean, message: string | null } | null>(null)
const testing = ref(false)
async function runTest() {
  testing.value = true
  try {
    testResult.value = await apiFetch('/api/app/autoreply/test', { method: 'POST', body: { comment: testComment.value, keywords: form.keywords, matchMode: form.matchMode, dmMessage: form.dmMessage, linkId: form.linkId } })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    testing.value = false
  }
}
watch(testOpen, (open) => {
  if (open) {
    testComment.value = form.keywords[0] ? `${form.keywords[0]} kak` : 'keren banget'
    testResult.value = null
  }
})
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <CommandBar :title="ruleId ? t('autoReply.editTitle') : t('autoReply.newTitle')" />
    <div
      v-if="loading"
      class="space-y-4"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-40 w-full"
      />
    </div>
    <form
      v-else
      class="space-y-4"
      @submit.prevent="save(true)"
    >
      <!-- 1. Post -->
      <UCard>
        <div class="flex gap-3">
          <span class="size-7 shrink-0 rounded-full bg-primary text-inverted text-sm font-semibold flex items-center justify-center">1</span>
          <div class="flex-1 min-w-0 space-y-3">
            <div>
              <h2 class="font-semibold text-highlighted">
                {{ t('autoReply.step1') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('autoReply.step1Hint') }}
              </p>
            </div>
            <UFormField
              v-if="accounts.length > 1"
              :label="t('autoReply.account')"
            >
              <USelect
                v-model="form.socialAccountId"
                :items="accountItems"
                class="w-full sm:w-64"
              />
            </UFormField>
            <URadioGroup
              v-model="form.scope"
              :items="scopeItems"
              orientation="horizontal"
              variant="card"
              :ui="{ fieldset: 'grid grid-cols-2 gap-2', item: 'w-full' }"
            />
            <div v-if="form.scope === 'post'">
              <div
                v-if="mediaLoading"
                class="grid grid-cols-3 sm:grid-cols-4 gap-2"
              >
                <USkeleton
                  v-for="n in 4"
                  :key="n"
                  class="aspect-square w-full"
                />
              </div>
              <p
                v-else-if="!media.length"
                class="text-sm text-muted"
              >
                {{ t('autoReply.noPosts') }}
              </p>
              <div
                v-else
                class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto p-0.5"
              >
                <button
                  v-for="item in media"
                  :key="item.externalId"
                  type="button"
                  class="relative aspect-square rounded-md overflow-hidden border-2 text-left bg-elevated"
                  :class="form.externalMediaId === item.externalId ? 'border-primary' : 'border-transparent'"
                  :aria-pressed="form.externalMediaId === item.externalId"
                  @click="form.externalMediaId = item.externalId"
                >
                  <img
                    v-if="item.thumbUrl"
                    :src="item.thumbUrl"
                    alt=""
                    class="size-full object-cover"
                  >
                  <span
                    v-else
                    class="block p-1.5 text-[11px] leading-tight text-muted line-clamp-5"
                  >{{ item.caption || '—' }}</span>
                  <UIcon
                    v-if="form.externalMediaId === item.externalId"
                    name="i-lucide-circle-check"
                    class="absolute top-1 right-1 size-5 text-primary bg-default rounded-full"
                  />
                </button>
              </div>
              <p
                v-if="fieldError === 'externalMediaId'"
                class="text-sm text-error mt-1"
              >
                {{ t('autoReply.step1Hint') }}
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- 2. Keywords -->
      <UCard>
        <div class="flex gap-3">
          <span class="size-7 shrink-0 rounded-full bg-primary text-inverted text-sm font-semibold flex items-center justify-center">2</span>
          <div class="flex-1 min-w-0 space-y-3">
            <div>
              <h2 class="font-semibold text-highlighted">
                {{ t('autoReply.step2') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('autoReply.step2Hint') }}
              </p>
            </div>
            <UInputTags
              v-model="form.keywords"
              :placeholder="t('autoReply.keywordPlaceholder')"
              :max="10"
              class="w-full"
              :color="fieldError === 'keywords' ? 'error' : undefined"
              :highlight="fieldError === 'keywords'"
            />
            <p
              v-if="!form.keywords.length && form.scope === 'post'"
              class="text-sm text-muted"
            >
              {{ t('autoReply.keywordsEmptyPost') }}
            </p>
            <UCollapsible>
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-between px-0"
                :label="t('links.advanced')"
                trailing-icon="i-lucide-chevron-down"
              />
              <template #content>
                <div class="space-y-4 pt-3">
                  <UFormField :label="t('autoReply.matchMode')">
                    <URadioGroup
                      v-model="form.matchMode"
                      :items="matchItems"
                    />
                  </UFormField>
                  <UFormField :label="t('autoReply.dailyCap')">
                    <UInputNumber
                      v-model="form.dailyCap"
                      :min="1"
                      :max="1000"
                      class="w-40"
                    />
                  </UFormField>
                  <UFormField :label="t('autoReply.name')">
                    <UInput
                      v-model="form.name"
                      :maxlength="80"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </template>
            </UCollapsible>
          </div>
        </div>
      </UCard>

      <!-- 3. Message + product -->
      <UCard>
        <div class="flex gap-3">
          <span class="size-7 shrink-0 rounded-full bg-primary text-inverted text-sm font-semibold flex items-center justify-center">3</span>
          <div class="flex-1 min-w-0 space-y-4">
            <div>
              <h2 class="font-semibold text-highlighted">
                {{ t('autoReply.step3') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('autoReply.step3Hint') }}
              </p>
            </div>
            <UFormField :label="t('autoReply.product')">
              <div
                v-if="link"
                class="flex items-center gap-3 rounded-lg border border-default p-2"
              >
                <img
                  v-if="link.imageUrl"
                  :src="link.imageUrl"
                  alt=""
                  class="size-12 rounded object-cover shrink-0"
                >
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-default line-clamp-1">
                    {{ link.title || link.destinationUrl }}
                  </p>
                  <p
                    v-if="link.priceIdr"
                    class="text-xs text-muted"
                  >
                    {{ formatIDR(link.priceIdr, locale) }}
                  </p>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :label="t('autoReply.changeProduct')"
                  @click="pickerOpen = true"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  :aria-label="t('autoReply.noProduct')"
                  @click="link = null; form.linkId = null"
                />
              </div>
              <UButton
                v-else
                icon="i-lucide-link"
                variant="soft"
                :label="t('autoReply.pickProduct')"
                @click="pickerOpen = true"
              />
            </UFormField>
            <UFormField :error="fieldError === 'dmMessage' ? true : undefined">
              <UTextarea
                ref="message"
                v-model="form.dmMessage"
                :rows="4"
                :maxlength="1000"
                autoresize
                class="w-full"
              />
              <div class="flex flex-wrap gap-2 mt-1.5">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-at-sign"
                  :label="t('autoReply.insertName')"
                  @click="insert('{nama}')"
                />
                <UButton
                  v-if="form.linkId"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-link"
                  :label="t('autoReply.insertLink')"
                  @click="insert('{link}')"
                />
              </div>
            </UFormField>
            <div class="space-y-2">
              <USwitch
                v-model="form.publicReply"
                :label="t('autoReply.publicReply')"
                :description="t('autoReply.publicReplyHint')"
              />
              <div
                v-if="form.publicReply"
                class="space-y-2 pl-0 sm:pl-11"
              >
                <div
                  v-for="(_, index) in form.publicReplyVariants"
                  :key="index"
                  class="flex gap-2"
                >
                  <UInput
                    v-model="form.publicReplyVariants[index]"
                    :maxlength="150"
                    class="flex-1"
                  />
                  <UButton
                    v-if="form.publicReplyVariants.length > 1"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    :aria-label="t('common.remove')"
                    @click="form.publicReplyVariants.splice(index, 1)"
                  />
                </div>
                <UButton
                  v-if="form.publicReplyVariants.length < MAX_PUBLIC_REPLIES"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-plus"
                  :label="t('autoReply.addVariant')"
                  @click="form.publicReplyVariants.push('')"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UAlert
        icon="i-simple-icons-instagram"
        color="neutral"
        variant="subtle"
        :title="t('autoReply.limitsNote')"
      />

      <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-flask-conical"
          :label="t('autoReply.test')"
          class="justify-center"
          @click="testOpen = true"
        />
        <UButton
          v-if="!ruleId || !wasActive"
          color="neutral"
          variant="outline"
          :label="t('autoReply.saveDraft')"
          :loading="saving === 'draft'"
          class="justify-center"
          @click="save(false)"
        />
        <UButton
          type="submit"
          :label="ruleId && wasActive ? t('common.save') : t('autoReply.activate')"
          :loading="saving === 'active'"
          icon="i-lucide-check"
          class="justify-center"
        />
      </div>
    </form>

    <ProductLinkPicker
      v-model:open="pickerOpen"
      @pick="pick"
    />

    <UModal
      v-model:open="testOpen"
      :title="t('autoReply.testTitle')"
      :description="t('autoReply.testHint')"
    >
      <template #body>
        <form
          class="space-y-3"
          @submit.prevent="runTest"
        >
          <UFormField :label="t('autoReply.testComment')">
            <div class="flex gap-2">
              <UInput
                v-model="testComment"
                class="flex-1"
                autofocus
              />
              <UButton
                type="submit"
                :loading="testing"
                :label="t('autoReply.test')"
              />
            </div>
          </UFormField>
          <UAlert
            v-if="testResult && testResult.matches"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('autoReply.testMatch')"
          >
            <template #description>
              <p class="whitespace-pre-line text-default mt-1">
                {{ testResult.message }}
              </p>
            </template>
          </UAlert>
          <UAlert
            v-else-if="testResult"
            color="neutral"
            variant="subtle"
            icon="i-lucide-circle-x"
            :title="t('autoReply.testNoMatch')"
          />
        </form>
      </template>
    </UModal>
  </div>
</template>
