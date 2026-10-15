<script setup lang="ts">
/** Bantuan (rail footer): the CMS help guide, the FAQ and how to reach the team. All content is editable in /admin. */
definePageMeta({ layout: 'creator' })
const { t } = useI18n()
useHead({ title: () => t('help.title') })

const [{ data: guide }, { data: landing }] = await Promise.all([
  useFetch<{ title: string, content: string }>('/api/public/pages/bantuan', { server: false }),
  useFetch<{ faqs: { id: string, question: string, answer: string }[], company: { email: string, whatsapp: string } }>('/api/public/landing', { server: false })
])
const faqItems = computed(() => (landing.value?.faqs ?? []).map(f => ({ label: f.question, content: f.answer, value: f.id })))
const whatsappUrl = computed(() => landing.value?.company.whatsapp ? `https://wa.me/${landing.value.company.whatsapp.replace(/\D/g, '')}` : null)
</script>

<template>
  <div class="w-full max-w-3xl mx-auto space-y-6">
    <CommandBar
      :title="t('help.title')"
      :description="t('help.subtitle')"
    />
    <UCard v-if="guide">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('help.guide') }}
        </h2>
      </template>
      <!-- Sanitized on save (server/core/admin/content.ts) -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="prose prose-sm prose-neutral dark:prose-invert max-w-none"
        v-html="guide.content"
      />
      <!-- eslint-enable vue/no-v-html -->
    </UCard>
    <UCard v-if="faqItems.length">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('help.faq') }}
        </h2>
      </template>
      <UAccordion
        :items="faqItems"
        type="multiple"
        :ui="{ body: 'text-muted whitespace-pre-line' }"
      />
    </UCard>
    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1">
          <h2 class="font-semibold text-highlighted">
            {{ t('help.contactTitle') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('help.contactBody') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="whatsappUrl"
            :to="whatsappUrl"
            external
            target="_blank"
            icon="i-simple-icons-whatsapp"
            :label="t('help.whatsapp')"
          />
          <UButton
            v-if="landing?.company.email"
            :to="`mailto:${landing.company.email}`"
            external
            color="neutral"
            variant="outline"
            icon="i-lucide-mail"
            :label="t('help.email')"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
