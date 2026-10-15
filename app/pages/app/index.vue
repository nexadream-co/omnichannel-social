<script setup lang="ts">
definePageMeta({ layout: 'creator' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
useHead({ title: () => t('nav.home') })

const profile = computed(() => auth.profile.value)

const STEPS = [
  { key: 'accountConnected', to: '/app/accounts', icon: 'i-lucide-at-sign' },
  { key: 'bioCreated', to: '/app/bio', icon: 'i-lucide-store' },
  { key: 'linkAdded', to: '/app/links', icon: 'i-lucide-link' },
  { key: 'postScheduled', to: '/app/compose', icon: 'i-lucide-calendar-plus' }
] as const

const steps = computed(() => STEPS.map(step => ({ ...step, done: Boolean(profile.value?.onboarding[step.key]) })))
const doneCount = computed(() => steps.value.filter(step => step.done).length)
const nextStep = computed(() => steps.value.find(step => !step.done)?.key)
const showChecklist = computed(() => profile.value && !profile.value.onboarding.dismissed)

const trialEnds = computed(() => {
  const sub = profile.value?.subscription
  if (sub?.status !== 'trialing' || !sub.trialEndsAt) return null
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: profile.value?.displayTimezone }).format(new Date(sub.trialEndsAt))
})
</script>

<template>
  <div
    v-if="profile"
    class="max-w-3xl mx-auto space-y-6"
  >
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold text-highlighted">
        {{ t('home.greeting', { name: profile.user.name.split(' ')[0] }) }}
      </h1>
      <p class="text-muted">
        {{ t('home.subtitle') }}
      </p>
    </div>

    <UAlert
      v-if="!profile.user.emailVerified"
      color="warning"
      variant="subtle"
      icon="i-lucide-mail-warning"
      :title="t('auth.verifyBanner')"
      :actions="[{ label: t('auth.verifyResend'), to: localePath('/app/auth/verify-email'), color: 'warning', variant: 'outline' }]"
    />

    <UAlert
      v-if="trialEnds"
      color="info"
      variant="subtle"
      icon="i-lucide-sparkles"
      :title="t('home.trialBanner', { plan: profile.subscription.planName, date: trialEnds })"
    />

    <UCard v-if="showChecklist">
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="font-semibold text-highlighted">
              {{ t('home.checklistTitle') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('home.checklistProgress', { done: doneCount, total: steps.length }) }}
            </p>
          </div>
          <UProgress
            :model-value="doneCount"
            :max="steps.length"
            class="w-24"
          />
        </div>
      </template>
      <ol class="divide-y divide-default -my-2">
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          class="py-3 flex gap-3 items-start"
        >
          <span
            class="mt-0.5 size-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold"
            :class="step.done ? 'bg-success text-inverted' : step.key === nextStep ? 'bg-primary text-inverted' : 'bg-elevated text-muted'"
          >
            <UIcon
              v-if="step.done"
              name="i-lucide-check"
              class="size-4"
            />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <div class="flex-1 min-w-0 space-y-1">
            <p
              class="font-medium"
              :class="step.done ? 'text-muted line-through' : 'text-highlighted'"
            >
              {{ t(`home.steps.${step.key}.title`) }}
            </p>
            <p
              v-if="!step.done"
              class="text-sm text-muted"
            >
              {{ t(`home.steps.${step.key}.body`) }}
            </p>
          </div>
          <UButton
            v-if="!step.done"
            :to="localePath(step.to)"
            :icon="step.icon"
            :label="t(`home.steps.${step.key}.action`)"
            :variant="step.key === nextStep ? 'solid' : 'outline'"
            size="sm"
            class="shrink-0 hidden sm:inline-flex"
          />
          <UButton
            v-if="!step.done"
            :to="localePath(step.to)"
            :icon="step.icon"
            :variant="step.key === nextStep ? 'solid' : 'outline'"
            size="sm"
            square
            class="sm:hidden"
            :aria-label="t(`home.steps.${step.key}.action`)"
          />
        </li>
      </ol>
      <p
        v-if="doneCount === steps.length"
        class="mt-4 text-sm text-success"
      >
        {{ t('home.allDone') }}
      </p>
    </UCard>
  </div>
</template>
