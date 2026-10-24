<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { rankAccountsToKeep } from '#shared/utils/billing-history'

/** "Pilih akun yang tetap aktif" after a downgrade (docs/blueprint/07 §6). Nothing is deleted, and it can wait ("Nanti saja"). */
interface PickAccount { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string, createdAt: string, upcomingPosts?: number, activeRules?: number }
const props = defineProps<{ accounts: PickAccount[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const { spark } = useCelebrate()

const max = computed(() => entitlements.limit('socialAccounts'))
const candidates = computed(() => props.accounts.filter(a => a.status !== 'revoked'))
const selected = ref<string[]>([])
watch([open, candidates, max], () => {
  if (open.value && !selected.value.length) selected.value = rankAccountsToKeep(candidates.value, max.value)
}, { immediate: true })
onMounted(() => entitlements.load())

function toggle(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(v => v !== id)
  else if (selected.value.length < max.value) selected.value = [...selected.value, id]
}
const saveButton = ref<{ $el: HTMLElement } | null>(null)
const saving = ref(false)
async function save() {
  const el = saveButton.value?.$el
  saving.value = true
  try {
    await apiFetch('/api/app/channels/select-active', { method: 'POST', body: { socialAccountIds: selected.value } })
    toast.add({ title: t('billing.selectSaved'), color: 'success' })
    if (el) spark(el)
    await auth.fetchProfile()
    await entitlements.load(true)
    open.value = false
    emit('saved')
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('billing.selectTitle')"
    :description="t('billing.selectBody', { n: max })"
  >
    <template #body>
      <ul class="space-y-2">
        <li
          v-for="account in candidates"
          :key="account.id"
        >
          <button
            type="button"
            class="w-full flex items-center gap-3 rounded-lg border p-3 text-left motion-safe:transition-colors"
            :class="selected.includes(account.id) ? 'border-primary bg-primary/5' : 'border-default'"
            :aria-pressed="selected.includes(account.id)"
            :disabled="!selected.includes(account.id) && selected.length >= max"
            @click="toggle(account.id)"
          >
            <UCheckbox
              :model-value="selected.includes(account.id)"
              tabindex="-1"
              class="pointer-events-none"
            />
            <SmartImage
              :src="account.avatarUrl"
              :alt="account.username ?? ''"
              :title="account.username"
              kind="avatar"
              class="size-9 shrink-0 rounded-full"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5 text-sm text-default">
                <span class="truncate">{{ account.username || PLATFORM_META[account.platform].name }}</span>
                <UIcon
                  :name="PLATFORM_META[account.platform].icon"
                  class="size-3.5 shrink-0 text-muted"
                />
              </span>
              <span class="block text-xs text-muted">{{ t('billing.selectUsage', { posts: account.upcomingPosts ?? 0, rules: account.activeRules ?? 0 }) }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p class="text-sm text-muted mt-3">
        {{ t('billing.selectCount', { selected: selected.length, max }) }}
      </p>
    </template>
    <template #footer>
      <div class="flex flex-col sm:flex-row gap-2 sm:justify-end w-full">
        <UButton
          ref="saveButton"
          autofocus
          :label="t('billing.selectSave')"
          :loading="saving"
          :disabled="!selected.length"
          class="justify-center"
          @click="save"
        />
        <UButton
          :to="localePath('/app/billing')"
          color="neutral"
          variant="ghost"
          icon="i-lucide-sparkles"
          :label="t('billing.selectUpgrade')"
          class="justify-center"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('billing.selectLater')"
          class="justify-center"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
