<script setup lang="ts">
const { t, locale } = useI18n()
const route = useRoute()
const code = computed(() => String(route.query.code ?? ''))
const { data, error } = await useFetch(() => `/api/public/data-deletion/${encodeURIComponent(code.value)}`, { immediate: Boolean(code.value) })
useSeoMeta({ title: () => t('legal.deletionStatusTitle'), robots: 'noindex' })
</script>

<template>
  <UContainer class="max-w-xl py-12">
    <UCard>
      <div class="space-y-4">
        <h1 class="text-2xl font-semibold text-highlighted">
          {{ t('legal.deletionStatusTitle') }}
        </h1>
        <template v-if="data">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted">
                {{ t('legal.code') }}
              </dt>
              <dd class="font-mono text-highlighted">
                {{ code }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                {{ t('legal.requestedAt') }}
              </dt>
              <dd>{{ formatDateTime(data.createdAt, { locale }) }}</dd>
            </div>
          </dl>
          <UAlert
            :color="data.status === 'completed' ? 'success' : 'info'"
            variant="subtle"
            :title="data.status === 'completed' ? t('legal.statusCompleted') : t('legal.statusPending')"
          />
        </template>
        <UAlert
          v-else-if="error || !code"
          color="warning"
          variant="subtle"
          :title="t('legal.notFound')"
        />
      </div>
    </UCard>
  </UContainer>
</template>
