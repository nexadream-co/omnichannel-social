<script setup lang="ts">
import { z } from 'zod'

const { t } = useI18n()
const toast = useToast()
const schema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  email: z.email('Email tidak valid.'),
  message: z.string().trim().min(10, 'Pesan minimal 10 karakter.')
})
const state = reactive({ name: '', email: '', phone: '', subject: '', message: '', website: '' })
const loading = ref(false)
const sent = ref(false)
async function onSubmit() {
  loading.value = true
  try {
    await apiFetch('/api/contact', { method: 'POST', body: { ...state, phone: state.phone || undefined, subject: state.subject || undefined } })
    sent.value = true
    Object.assign(state, { name: '', email: '', phone: '', subject: '', message: '' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="sent"
    color="success"
    variant="subtle"
    icon="i-lucide-circle-check"
    :title="t('landing.form.sent')"
  />
  <UForm
    v-else
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('landing.form.name')"
        name="name"
        required
      >
        <UInput
          v-model="state.name"
          autocomplete="name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('landing.form.email')"
        name="email"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('landing.form.phone')"
        name="phone"
      >
        <UInput
          v-model="state.phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('landing.form.subject')"
        name="subject"
      >
        <UInput
          v-model="state.subject"
          class="w-full"
        />
      </UFormField>
    </div>
    <UFormField
      :label="t('landing.form.message')"
      name="message"
      required
    >
      <UTextarea
        v-model="state.message"
        :rows="5"
        class="w-full"
      />
    </UFormField>
    <!-- Honeypot: invisible to people, irresistible to bots -->
    <input
      v-model="state.website"
      type="text"
      name="website"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
      class="absolute -left-[9999px] size-px opacity-0"
    >
    <UButton
      type="submit"
      size="lg"
      :loading="loading"
      :label="t('landing.form.send')"
      icon="i-lucide-send"
    />
  </UForm>
</template>
