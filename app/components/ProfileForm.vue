<script setup lang="ts">
import { z } from 'zod'
import { formatIndonesianPhone, isValidIndonesianPhone } from '#shared/utils/phone'
import { AVATAR_MAX_BYTES, AVATAR_MAX_PX } from '#shared/utils/uploads'

const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t, setLocale, locales } = useI18n()
const toast = useToast()
const auth = props.audience === 'creator' ? useCreatorAuth() : useStaffAuth()
const endpoint = props.audience === 'creator' ? '/api/app/me' : '/api/admin/me'
const uploadEndpoint = props.audience === 'creator' ? '/api/app/uploads?kind=avatar' : '/api/admin/uploads?kind=avatar'

const user = computed(() => auth.profile.value?.user)
const state = reactive({ name: '', phone: '', image: null as string | null, locale: 'id' as 'id' | 'en' })
watchEffect(() => {
  if (!user.value) return
  state.name = user.value.name
  state.phone = formatIndonesianPhone(user.value.phone)
  state.image = user.value.image
  state.locale = (user.value as { locale?: 'id' | 'en' }).locale ?? 'id'
})

const schema = computed(() => z.object({
  name: z.string().trim().min(2, t('authError.nameShort')),
  phone: z.string().trim().refine(value => !value || isValidIndonesianPhone(value), 'Nomor HP tidak valid.')
}))

// Unsaved work: anything that differs from what the server last gave us.
const dirty = computed(() => {
  const u = user.value as { name: string, phone: string | null, image: string | null, locale?: 'id' | 'en' } | undefined
  if (!u) return false
  return state.name !== u.name || state.phone !== formatIndonesianPhone(u.phone) || state.image !== u.image || state.locale !== (u.locale ?? 'id')
})
useUnsavedChanges(dirty)
const { done, trigger } = useCheckPop()

const saving = ref(false)
const uploading = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('file')

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const blob = await resizeImage(file, AVATAR_MAX_PX, AVATAR_MAX_BYTES)
    const form = new FormData()
    form.append('file', blob, 'avatar.jpg')
    const result = await apiFetch<{ url: string }>(uploadEndpoint, { method: 'POST', body: form })
    state.image = result.url
  } catch (caught) {
    toast.add({ title: caught instanceof Error && caught.message === 'too-large' ? t('profile.photoTooLarge') : extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function save() {
  saving.value = true
  try {
    const body: Record<string, unknown> = { name: state.name, phone: state.phone, image: state.image }
    if (props.audience === 'creator') body.locale = state.locale
    await apiFetch(endpoint, { method: 'PATCH', body })
    await auth.fetchProfile()
    if (props.audience === 'creator') await setLocale(state.locale)
    trigger()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <UForm
      :schema="schema"
      :state="state"
      class="space-y-5"
      @submit="save"
    >
      <div class="flex items-center gap-4">
        <UAvatar
          :src="state.image ?? undefined"
          :alt="state.name"
          size="3xl"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            :loading="uploading"
            icon="i-lucide-upload"
            variant="outline"
            :label="t('profile.changePhoto')"
            @click="fileInput?.click()"
          />
          <UButton
            v-if="state.image"
            color="neutral"
            variant="ghost"
            :label="t('profile.removePhoto')"
            @click="state.image = null"
          />
          <input
            ref="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            @change="onFile"
          >
        </div>
      </div>
      <UFormField
        :label="t('auth.name')"
        name="name"
      >
        <UInput
          v-model="state.name"
          autocomplete="name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('auth.email')"
        :description="t('profile.emailHint')"
      >
        <UInput
          :model-value="user?.email"
          disabled
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('auth.phone')"
        name="phone"
      >
        <UInput
          v-model="state.phone"
          type="tel"
          inputmode="tel"
          placeholder="08xxxxxxxxxx"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-if="audience === 'creator'"
        :label="t('nav.language')"
        name="locale"
      >
        <USelect
          v-model="state.locale"
          :items="locales.map(l => ({ value: l.code, label: l.name ?? l.code }))"
          class="w-full"
        />
      </UFormField>
      <div class="flex justify-end">
        <SaveButton
          type="submit"
          :loading="saving"
          :done="done"
        />
      </div>
    </UForm>
  </UCard>
</template>
