<script setup lang="ts">
import { INDONESIAN_TIMEZONES, type IndonesianTimezone } from '#shared/utils/auth'

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const toast = useToast()
const auth = useCreatorAuth()
useHead({ title: () => t('settings.title') })

const canManage = computed(() => auth.hasAbility('settings.manage'))
const canAccount = computed(() => auth.hasAbility('account.manage'))
const PROGRAMS = ['shopee', 'tiktok_shop', 'tokopedia', 'lazada', 'other'] as const

type Program = typeof PROGRAMS[number]
const state = reactive({ name: '', timezone: 'Asia/Jakarta' as IndonesianTimezone, niche: '', affiliatePrograms: [] as Program[] })
const deleteRequestedAt = ref<string | null>(null)
const slaDays = ref(30)
const saving = ref(false)

onMounted(async () => {
  const [row, site] = await Promise.all([
    apiFetch<{ name: string, timezone: IndonesianTimezone, niche: string | null, affiliatePrograms: Program[], deleteRequestedAt: string | null }>('/api/app/settings'),
    $fetch<{ privacy: { deleteRequestSlaDays: number } }>('/api/public/site').catch(() => null)
  ])
  Object.assign(state, { name: row.name, timezone: row.timezone, niche: row.niche ?? '', affiliatePrograms: row.affiliatePrograms })
  deleteRequestedAt.value = row.deleteRequestedAt
  if (site) slaDays.value = site.privacy.deleteRequestSlaDays
})

const timezones = computed(() => INDONESIAN_TIMEZONES.map(value => ({ value, label: t(`timezones.${value}`) })))
const programs = computed(() => PROGRAMS.map(value => ({ value, label: t(`programs.${value}`) })))

async function save() {
  saving.value = true
  try {
    await apiFetch('/api/app/settings', { method: 'PATCH', body: { ...state, niche: state.niche || null } })
    await auth.fetchProfile()
    toast.add({ title: t('settings.saved'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}

function exportData() {
  // A plain navigation keeps the session cookie and lets the browser save the attachment.
  window.location.href = '/api/app/account/export'
}

const deleteOpen = ref(false)
const deleteForm = reactive({ reason: '', confirmation: false })
const deleting = ref(false)
async function requestDelete() {
  deleting.value = true
  try {
    await apiFetch('/api/app/account/delete-request', { method: 'POST', body: { reason: deleteForm.reason || undefined, confirmation: deleteForm.confirmation } })
    deleteRequestedAt.value = new Date().toISOString()
    deleteOpen.value = false
    toast.add({ title: t('settings.deleteSent'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-2xl mx-auto space-y-6">
    <CommandBar
      :title="t('settings.title')"
      :description="t('settings.subtitle')"
    />
    <UCard v-if="canManage">
      <form
        class="space-y-5"
        @submit.prevent="save"
      >
        <UFormField
          :label="t('settings.workspaceName')"
          name="name"
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('settings.timezone')"
          :description="t('settings.timezoneHint')"
          name="timezone"
        >
          <USelect
            v-model="state.timezone"
            :items="timezones"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('settings.niche')"
          name="niche"
        >
          <UInput
            v-model="state.niche"
            :placeholder="t('settings.nichePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('settings.programs')"
          name="affiliatePrograms"
        >
          <UCheckboxGroup
            v-model="state.affiliatePrograms"
            :items="programs"
          />
        </UFormField>
        <div class="flex justify-end">
          <UButton
            type="submit"
            :loading="saving"
            :label="t('common.save')"
          />
        </div>
      </form>
    </UCard>

    <WatermarkSettings v-if="canManage" />

    <UCard v-if="canAccount">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('settings.dataTitle') }}
        </h2>
      </template>
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p class="font-medium">
              {{ t('settings.exportTitle') }}
            </p>
            <p class="text-sm text-muted">
              {{ t('settings.exportBody') }}
            </p>
          </div>
          <UButton
            icon="i-lucide-download"
            variant="outline"
            :label="t('settings.exportButton')"
            class="shrink-0"
            @click="exportData"
          />
        </div>
        <USeparator />
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p class="font-medium text-error">
              {{ t('settings.deleteTitle') }}
            </p>
            <p class="text-sm text-muted">
              {{ deleteRequestedAt ? t('settings.deleteRequestedOn', { date: formatDate(deleteRequestedAt, { locale }) }) : t('settings.deleteBody', { days: slaDays }) }}
            </p>
          </div>
          <UButton
            v-if="!deleteRequestedAt"
            color="error"
            variant="outline"
            :label="t('settings.deleteButton')"
            class="shrink-0"
            @click="deleteOpen = true"
          />
        </div>
      </div>
    </UCard>

    <UModal
      v-model:open="deleteOpen"
      :title="t('settings.deleteTitle')"
      :description="t('settings.deleteBody', { days: slaDays })"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('settings.deleteReason')">
            <UTextarea
              v-model="deleteForm.reason"
              :rows="3"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="deleteForm.confirmation"
            :label="t('settings.deleteConfirm')"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="deleteOpen = false"
          />
          <UButton
            color="error"
            :disabled="!deleteForm.confirmation"
            :loading="deleting"
            :label="t('settings.deleteButton')"
            @click="requestDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
