<script setup lang="ts">
import { FEATURE_KEYS, FEATURE_META, LIMIT_META, formatLimit, type FeatureKey, type LimitKey } from '#shared/utils/plans'

interface Plan { slug: string, name: string, description: string | null, priceMonthly: number, priceYearly: number, trialDays: number, limits: Record<string, number>, features: Record<string, boolean> }
const props = defineProps<{ plans: Plan[], trialPlanSlug: string, registrationOpen: boolean }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const period = ref<'monthly' | 'yearly'>('monthly')
const price = (p: Plan) => (period.value === 'yearly' ? p.priceYearly : p.priceMonthly)
const save = computed(() => Math.max(0, ...props.plans.filter(p => p.priceMonthly > 0 && p.priceYearly > 0).map(p => Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100))))
const KEYS: LimitKey[] = ['socialAccounts', 'scheduledPostsPerMonth', 'autoReplyDmsPerMonth', 'bioPages', 'clickRetentionDays']
const SUFFIX: Partial<Record<LimitKey, string>> = { socialAccounts: 'media sosial', scheduledPostsPerMonth: 'per bulan', autoReplyDmsPerMonth: 'otomatis per bulan', bioPages: 'Etalase', clickRetentionDays: 'riwayat statistik' }
const line = (key: LimitKey, v: number) => (v === -1 ? `${LIMIT_META[key].label} tanpa batas` : `${formatLimit(key, v)} ${SUFFIX[key] ?? ''}`.trim())
const featured = computed(() => props.trialPlanSlug)
</script>

<template>
  <div class="space-y-8">
    <div class="flex justify-center">
      <UTabs
        v-model="period"
        :items="[{ value: 'monthly', label: t('landing.monthly') }, { value: 'yearly', label: save ? `${t('landing.yearly')} · ${t('landing.yearlySave', { n: save })}` : t('landing.yearly') }]"
        :content="false"
      />
    </div>
    <div
      class="grid gap-6 mx-auto"
      :class="plans.length >= 3 ? 'md:grid-cols-3 max-w-6xl' : 'md:grid-cols-2 max-w-4xl'"
    >
      <div
        v-for="plan in plans"
        :key="plan.slug"
        v-reveal
        class="relative rounded-2xl border bg-default p-6 flex flex-col gap-5"
        :class="plan.slug === featured ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary' : 'border-default'"
      >
        <UBadge
          v-if="plan.slug === featured && plan.trialDays > 0"
          class="absolute -top-3 left-6"
          :label="t('landing.trialBadge', { n: plan.trialDays })"
        />
        <div>
          <h3 class="text-xl font-semibold text-highlighted">
            {{ plan.name }}
          </h3>
          <p
            v-if="plan.description"
            class="text-sm text-muted mt-1"
          >
            {{ plan.description }}
          </p>
        </div>
        <p>
          <span class="text-4xl font-bold text-highlighted">{{ price(plan) > 0 ? formatIDR(price(plan), locale) : t('landing.free') }}</span>
          <span
            v-if="price(plan) > 0"
            class="text-muted"
          >{{ period === 'yearly' ? t('landing.perYear') : t('landing.perMonth') }}</span>
        </p>
        <ul class="space-y-2 text-sm flex-1">
          <li
            v-for="key in KEYS"
            :key="key"
            class="flex gap-2"
          >
            <UIcon
              name="i-lucide-check"
              class="size-4 text-primary shrink-0 mt-0.5"
            />
            <span>{{ line(key, plan.limits[key] ?? 0) }}</span>
          </li>
          <li
            v-for="key in FEATURE_KEYS.filter(k => plan.features[k])"
            :key="key"
            class="flex gap-2"
          >
            <UIcon
              name="i-lucide-check"
              class="size-4 text-primary shrink-0 mt-0.5"
            />
            <span>{{ FEATURE_META[key as FeatureKey].label }}</span>
          </li>
        </ul>
        <UButton
          v-if="registrationOpen"
          :to="localePath('/app/auth/register')"
          size="lg"
          block
          :variant="plan.slug === featured ? 'solid' : 'outline'"
          :label="price(plan) > 0 ? t('landing.choose', { plan: plan.name }) : t('landing.startFree')"
        />
      </div>
    </div>
    <p class="text-center text-sm text-muted">
      {{ t('landing.noCard') }}
    </p>
  </div>
</template>
