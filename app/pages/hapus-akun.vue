<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { data: site } = await useFetch('/api/public/site')
useSeoMeta({ title: () => t('legal.deleteTitle') })
</script>

<template>
  <UContainer class="max-w-3xl py-12 space-y-6">
    <h1 class="text-3xl font-bold text-highlighted">
      {{ t('legal.deleteTitle') }}
    </h1>
    <!-- Every number on this page comes from settings, so the page and the app can never disagree (docs/blueprint/05 §8). -->
    <div class="space-y-4 text-default">
      <p>{{ t('legal.deleteIntro') }}</p>
      <ol class="list-decimal pl-6 space-y-2">
        <li>
          <i18n-t
            keypath="legal.deleteStep1"
            scope="global"
          >
            <template #settings>
              <NuxtLink
                :to="localePath('/app/settings')"
                class="text-primary"
              >{{ t('legal.deleteStep1Settings') }}</NuxtLink>
            </template>
            <template #action>
              <strong>{{ t('settings.deleteButton') }}</strong>
            </template>
          </i18n-t>
        </li>
        <li>
          <i18n-t
            keypath="legal.deleteStep2"
            scope="global"
          >
            <template #email>
              <a
                :href="`mailto:${site?.privacy.contactEmail}`"
                class="text-primary"
              >{{ site?.privacy.contactEmail }}</a>
            </template>
          </i18n-t>
        </li>
      </ol>
      <p>
        <i18n-t
          keypath="legal.deleteSla"
          scope="global"
        >
          <template #days>
            <strong>{{ site?.privacy.deleteRequestSlaDays }}</strong>
          </template>
        </i18n-t>
      </p>
      <ul class="list-disc pl-6 space-y-2">
        <li>{{ t('legal.deleteAfter1') }}</li>
        <li>{{ t('legal.deleteAfter2') }}</li>
        <li>{{ t('legal.deleteAfter3', { days: site?.privacy.backupRetentionDays }) }}</li>
        <li>{{ t('legal.deleteAfter4', { years: site?.privacy.financialRetentionYears }) }}</li>
      </ul>
      <p>{{ t('legal.deleteMeta') }}</p>
    </div>
  </UContainer>
</template>
