<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

definePageMeta({ layout: 'creator' })

const { t, tm, rt, locale } = useI18n()
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

// "What do I do today?" (docs/SCREENS.md #12): upcoming posts and problems with a fix button.
interface Upcoming { id: string, caption: string, scheduledAt: string | null, targets: { platform: Platform }[] }
const upcoming = ref<Upcoming[]>([])
const failedCount = ref(0)
onMounted(async () => {
  if (!auth.hasAbility('posts.read')) return
  const [scheduled, failed] = await Promise.all([
    apiFetch<{ items: Upcoming[] }>('/api/app/posts', { query: { tab: 'scheduled', limit: 5 } }).catch(() => ({ items: [] })),
    apiFetch<{ meta: { total: number } }>('/api/app/posts', { query: { tab: 'failed', limit: 1 } }).catch(() => ({ meta: { total: 0 } }))
  ])
  upcoming.value = scheduled.items
  failedCount.value = failed.meta.total
})

interface Summary { clicks7d: number, autoReplies7d: number, topProducts: { linkId: string, title: string | null, imageUrl: string | null, clicks: number }[], needsReauth: number }
const summary = ref<Summary | null>(null)
onMounted(async () => {
  if (auth.hasAbility('analytics.read')) summary.value = await apiFetch<Summary>('/api/app/home').catch(() => null)
})
// One tip per day, the same all day (tips live in i18n so both languages rotate together).
const tips = computed(() => tm('home.tips') as unknown[])
const tip = computed(() => {
  const day = Math.floor(Date.now() / 86_400_000)
  return tips.value.length ? rt(tips.value[day % tips.value.length] as Parameters<typeof rt>[0]) : ''
})

const { confirm } = useConfirmDialog()
async function dismiss() {
  if (!(await confirm({ title: t('home.dismiss'), description: t('home.dismissConfirm') }))) return
  await apiFetch('/api/app/onboarding/dismiss', { method: 'POST' })
  await auth.fetchProfile()
}
</script>

<template>
  <div
    v-if="profile"
    class="w-full max-w-3xl mx-auto space-y-6"
  >
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold text-highlighted">
        {{ t('home.greeting', { name: profile.user.name.split(' ')[0] }) }}
      </h1>
      <p class="text-muted">
        {{ doneCount === steps.length ? t('home.subtitleDone') : t('home.subtitle') }}
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
      <template
        v-if="auth.hasAbility('settings.manage')"
        #footer
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-eye-off"
          :label="t('home.dismiss')"
          @click="dismiss"
        />
      </template>
    </UCard>

    <UAlert
      v-if="failedCount"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('home.failedAlert', { count: failedCount })"
      :actions="[{ label: t('home.failedAction'), to: localePath({ path: '/app/posts', query: { tab: 'failed' } }), color: 'error', variant: 'outline' }]"
    />

    <UAlert
      v-if="summary?.needsReauth"
      color="warning"
      variant="subtle"
      icon="i-lucide-plug-zap"
      :title="t('home.reauthAlert', { count: summary.needsReauth })"
      :actions="[{ label: t('home.reauthAction'), to: localePath('/app/accounts'), color: 'warning', variant: 'outline' }]"
    />

    <div
      v-if="summary"
      class="grid grid-cols-2 gap-3"
    >
      <NuxtLink
        :to="localePath('/app/analytics')"
        class="rounded-lg border border-default p-4 hover:bg-elevated/50"
      >
        <p class="text-2xl font-semibold text-highlighted">
          {{ formatCompact(summary.clicks7d, locale) }}
        </p>
        <p class="text-sm text-muted">
          {{ t('home.clicksWeek') }}
        </p>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/app/auto-reply/activity')"
        class="rounded-lg border border-default p-4 hover:bg-elevated/50"
      >
        <p class="text-2xl font-semibold text-highlighted">
          {{ formatCompact(summary.autoReplies7d, locale) }}
        </p>
        <p class="text-sm text-muted">
          {{ t('home.autoRepliesWeek') }}
        </p>
      </NuxtLink>
    </div>

    <UCard v-if="summary?.topProducts.length">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('home.topProducts') }}
        </h2>
      </template>
      <ul class="space-y-3">
        <li
          v-for="product in summary.topProducts"
          :key="product.linkId"
        >
          <NuxtLink
            :to="localePath(`/app/links/${product.linkId}`)"
            class="flex items-center gap-3"
          >
            <img
              v-if="product.imageUrl"
              :src="product.imageUrl"
              alt=""
              class="size-10 rounded object-cover shrink-0"
            >
            <div
              v-else
              class="size-10 rounded bg-elevated shrink-0"
            />
            <span class="text-sm text-default truncate flex-1">{{ product.title || '—' }}</span>
            <span class="text-sm font-semibold text-highlighted">{{ t('home.clicks', { n: product.clicks }) }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UCard>

    <UCard v-if="auth.hasAbility('posts.read')">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-highlighted">
            {{ t('home.upcoming') }}
          </h2>
          <ULink
            :to="localePath('/app/calendar')"
            class="text-sm text-primary"
          >
            {{ t('nav.calendar') }}
          </ULink>
        </div>
      </template>
      <p
        v-if="!upcoming.length"
        class="text-sm text-muted"
      >
        {{ t('home.noUpcoming') }}
      </p>
      <ul
        v-else
        class="divide-y divide-default -my-2"
      >
        <li
          v-for="post in upcoming"
          :key="post.id"
        >
          <NuxtLink
            :to="localePath(`/app/posts/${post.id}`)"
            class="flex items-center gap-3 py-2.5"
          >
            <span class="text-sm text-muted w-28 shrink-0">{{ post.scheduledAt ? formatRelative(post.scheduledAt, locale) : '—' }}</span>
            <span class="flex gap-1 shrink-0">
              <UIcon
                v-for="p in [...new Set(post.targets.map(x => x.platform))]"
                :key="p"
                :name="PLATFORM_META[p].icon"
                class="size-4"
              />
            </span>
            <span class="text-sm truncate">{{ post.caption || t('posts.noCaption') }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UCard>

    <div
      v-if="tip"
      class="flex gap-3 rounded-lg bg-primary/5 border border-primary/20 p-4"
    >
      <UIcon
        name="i-lucide-lightbulb"
        class="size-5 text-primary shrink-0 mt-0.5"
      />
      <div>
        <p class="text-sm font-medium text-highlighted">
          {{ t('home.tipTitle') }}
        </p>
        <p class="text-sm text-default">
          {{ tip }}
        </p>
      </div>
    </div>
  </div>
</template>
