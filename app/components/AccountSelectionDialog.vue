<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

/** Blocking "Pilih akun yang tetap aktif" after a downgrade (docs/blueprint/07 §6). Nothing is deleted. */
const props = defineProps<{ accounts: { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string }[] }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()

const open = computed(() => Boolean(auth.workspace.value?.needsAccountSelection))
const max = computed(() => entitlements.limit('socialAccounts'))
const candidates = computed(() => props.accounts.filter(a => a.status !== 'revoked'))
const selected = ref<string[]>([])
watch([open, candidates, max], () => {
  if (open.value && !selected.value.length) selected.value = candidates.value.filter(a => a.status === 'active').slice(0, max.value).map(a => a.id)
}, { immediate: true })
onMounted(() => entitlements.load())

function toggle(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(v => v !== id)
  else if (selected.value.length < max.value) selected.value = [...selected.value, id]
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await apiFetch('/api/app/channels/select-active', { method: 'POST', body: { socialAccountIds: selected.value } })
    toast.add({ title: t('billing.selectSaved'), color: 'success' })
    await auth.fetchProfile()
    await entitlements.load(true)
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
    :open="open"
    :title="t('billing.selectTitle')"
    :description="t('billing.selectBody', { n: max })"
    :dismissible="false"
    :close="false"
  >
    <template #body>
      <ul class="space-y-2">
        <li
          v-for="account in candidates"
          :key="account.id"
        >
          <button
            type="button"
            class="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors"
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
            <UIcon
              :name="PLATFORM_META[account.platform].icon"
              class="size-5 shrink-0"
            />
            <span class="text-sm text-default truncate">{{ account.username || PLATFORM_META[account.platform].name }}</span>
          </button>
        </li>
      </ul>
      <p class="text-sm text-muted mt-3">
        {{ t('billing.selectCount', { selected: selected.length, max }) }}
      </p>
    </template>
    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full">
        <UButton
          :to="localePath('/app/billing')"
          color="neutral"
          variant="ghost"
          icon="i-lucide-sparkles"
          :label="t('billing.selectUpgrade')"
          class="justify-center"
        />
        <UButton
          :label="t('billing.selectSave')"
          :loading="saving"
          :disabled="!selected.length"
          class="justify-center"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
