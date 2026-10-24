<script setup lang="ts">
import { LIMIT_META, type LimitKey } from '#shared/utils/plans'

/** "Pemakaian bulan ini": used / limit per plan limit, from the entitlements payload. */
const METER_KEYS: LimitKey[] = ['scheduledPostsPerMonth', 'socialAccounts', 'autoReplyDmsPerMonth', 'autoReplyRules', 'bioPages', 'mediaStorageMb', 'teamMembers']

const { t } = useI18n()
const entitlements = useEntitlements()
onMounted(() => entitlements.load())

const rows = computed(() => METER_KEYS.map((key) => {
  const unlimited = entitlements.isUnlimited(key)
  const limit = entitlements.limit(key)
  const used = entitlements.used(key)
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  // At the limit is amber (a heads-up); red only when over it (a downgrade can leave usage above the new limit).
  const color = (!unlimited && used > limit ? 'error' : pct >= 80 ? 'warning' : 'primary') as 'error' | 'warning' | 'primary'
  return { key, label: LIMIT_META[key].label, unlimited, limit, used, pct, color }
}))
</script>

<template>
  <UCard v-if="entitlements.data.value">
    <template #header>
      <h2 class="font-semibold text-highlighted">
        {{ t('billing.usage.title') }}
      </h2>
    </template>
    <ul class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <li
        v-for="row in rows"
        :key="row.key"
        class="space-y-1.5"
      >
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="text-default">{{ row.label }}</span>
          <span
            class="tabular-nums"
            :class="row.color === 'error' ? 'text-error' : row.color === 'warning' ? 'text-warning' : 'text-muted'"
          >{{ row.unlimited ? t('billing.usage.unlimited') : `${row.used}/${row.limit}` }}</span>
        </div>
        <UProgress
          v-if="!row.unlimited"
          :model-value="row.pct"
          :max="100"
          size="sm"
          :color="row.color"
          :aria-label="row.label"
        />
      </li>
    </ul>
  </UCard>
</template>
