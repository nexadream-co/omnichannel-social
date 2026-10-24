<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { ONBOARDING_STEPS } from '#shared/utils/onboarding'
import type { MomentsSummary } from '~/components/HomeMoments.vue'
import type { OverduePost } from '~/components/OverduePostCard.vue'

definePageMeta({ layout: 'creator' })

const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const { reach, at } = useMilestones()
const { confetti } = useCelebrate()
useHead({ title: () => t('nav.home') })

const profile = computed(() => auth.profile.value)

const stepCount = ONBOARDING_STEPS.length
const doneCount = computed(() => ONBOARDING_STEPS.filter(step => profile.value?.onboarding[step.key]).length)
const allDone = computed(() => doneCount.value === stepCount)
const showChecklist = computed(() => Boolean(profile.value && !profile.value.onboarding.dismissed && !allDone.value))
// The whole checklist is hidden once it is done; a chip stays for a day so the win is not missed.
const showDoneChip = computed(() => {
  const finished = at('checklistComplete')
  return Boolean(profile.value && !profile.value.onboarding.dismissed && allDone.value && finished && Date.now() - new Date(finished).getTime() < 86_400_000)
})
// The progress bar fills from where it was; a new workspace sees it grow once the page is ready.
const shownDone = ref(0)
watch(doneCount, value => requestAnimationFrame(() => {
  shownDone.value = value
}), { immediate: true, flush: 'post' })

watch([profile, allDone], ([current, done]) => {
  if (!current || !done || !reach('checklistComplete')) return
  confetti({ big: true })
  toast.add({ title: t('home.checklistComplete'), color: 'success', icon: 'i-lucide-party-popper' })
}, { immediate: true })

// "What do I do today?" (docs/SCREENS.md #12): problems first, then what is coming up.
interface Upcoming { id: string, caption: string, scheduledAt: string | null, targets: { platform: Platform }[] }
interface Counts { scheduled: number, overdue: number, draft: number, published: number, failed: number }
const upcoming = ref<Upcoming[]>([])
const upcomingReady = ref(false)
const overdue = ref<OverduePost[]>([])
const counts = ref<Counts>({ scheduled: 0, overdue: 0, draft: 0, published: 0, failed: 0 })
const canRead = computed(() => auth.hasAbility('posts.read'))
async function loadPosts() {
  if (!canRead.value) return
  const [numbers, scheduled] = await Promise.all([
    apiFetch<Counts>('/api/app/posts/counts').catch(() => counts.value),
    apiFetch<{ items: Upcoming[] }>('/api/app/posts', { query: { tab: 'scheduled', due: 'upcoming', limit: 5 } }).catch(() => ({ items: [] as Upcoming[] }))
  ])
  counts.value = numbers
  upcoming.value = scheduled.items
  upcomingReady.value = true
  overdue.value = numbers.overdue
    ? (await apiFetch<{ items: OverduePost[] }>('/api/app/posts', { query: { tab: 'scheduled', due: 'overdue', limit: 5 } }).catch(() => ({ items: [] as OverduePost[] }))).items
    : []
}

interface Summary extends MomentsSummary {
  topProducts: { linkId: string, title: string | null, imageUrl: string | null, clicks: number }[]
  needsReauth: number
  bioUrl: string | null
  overdueCount: number
}
const summary = ref<Summary | null>(null)
// Stat numbers start at zero and tick up to the real value, so a first click is felt.
const shown = reactive({ clicks: 0, replies: 0 })
async function loadSummary() {
  if (!auth.hasAbility('analytics.read')) return
  summary.value = await apiFetch<Summary>('/api/app/home').catch(() => null)
  if (summary.value) {
    await nextTick()
    requestAnimationFrame(() => {
      shown.clicks = summary.value!.clicks7d
      shown.replies = summary.value!.autoReplies7d
    })
  }
}
onMounted(() => Promise.all([loadPosts(), loadSummary()]))

// Renewal countdown: only for the person who pays, only in the last week of a paid period (trial and grace have their own banner).
const renewal = computed(() => {
  const sub = profile.value?.subscription
  if (!sub || sub.status !== 'active' || !sub.currentPeriodEnd || !auth.hasAbility('billing.manage')) return null
  const days = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000)
  return days >= 0 && days <= 7 ? { plan: sub.planName, days } : null
})

// One tip per day, the same all day (tips live in i18n so both languages rotate together).
const tips = computed(() => tm('home.tips') as unknown[])
const tip = computed(() => {
  const day = Math.floor(Date.now() / 86_400_000)
  return tips.value.length ? rt(tips.value[day % tips.value.length] as Parameters<typeof rt>[0]) : ''
})

const welcome = ref(route.query.welcome === '1')
// The sheet is opened from the address once, then the address is cleaned so a reload does not show it again.
onMounted(() => {
  if (route.query.welcome === '1') navigateTo({ query: {} }, { replace: true })
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
    class="w-full max-w-3xl lg:max-w-6xl mx-auto space-y-6"
  >
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold text-highlighted">
        {{ t('home.greeting', { name: profile.user.name.split(' ')[0] }) }}
      </h1>
      <p class="text-muted">
        {{ allDone ? t('home.subtitleDone') : t('home.subtitle') }}
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

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div class="space-y-6 min-w-0">
        <UCard v-if="showChecklist">
          <template #header>
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-4">
                <h2 class="font-semibold text-highlighted">
                  {{ t('home.checklistTitle') }}
                </h2>
                <p class="text-sm text-muted tabular-nums">
                  {{ t('onboarding.progress', { done: doneCount, total: stepCount }) }}
                </p>
              </div>
              <UProgress
                :model-value="shownDone"
                :max="stepCount"
                size="sm"
              />
            </div>
          </template>
          <OnboardingSteps :onboarding="profile.onboarding" />
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

        <div
          v-else-if="showDoneChip"
          class="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3"
        >
          <p class="text-sm font-medium text-success">
            {{ t('onboarding.doneChip') }}
          </p>
          <UButton
            v-if="auth.hasAbility('settings.manage')"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-x"
            square
            :aria-label="t('home.dismiss')"
            @click="dismiss"
          />
        </div>

        <div
          v-if="counts.failed || summary?.needsReauth || overdue.length"
          class="space-y-3"
        >
          <UAlert
            v-if="counts.failed"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('home.failedAlert', { count: counts.failed })"
            :actions="[{ label: t('home.failedAction'), to: localePath({ path: '/app/posts', query: { tab: 'failed' } }), color: 'error', variant: 'outline' }]"
          />
          <UAlert
            v-if="summary?.needsReauth"
            color="warning"
            variant="subtle"
            icon="i-lucide-plug-zap"
            :title="t('home.reauthAlert', { count: summary.needsReauth })"
            :actions="[{ label: t('home.reauthAction'), to: localePath('/app/accounts'), color: 'warning', variant: 'solid' }]"
          />
          <div
            v-if="overdue.length"
            class="space-y-2"
          >
            <h2 class="text-sm font-semibold text-highlighted">
              {{ t('home.overdueTitle', { count: counts.overdue }) }}
            </h2>
            <TransitionGroup
              name="list"
              tag="div"
              class="space-y-2"
            >
              <OverduePostCard
                v-for="post in overdue"
                :key="post.id"
                :post="post"
                @changed="loadPosts"
              />
            </TransitionGroup>
            <NuxtLink
              v-if="counts.overdue > overdue.length"
              :to="localePath({ path: '/app/posts', query: { tab: 'scheduled' } })"
              class="text-sm text-primary"
            >
              {{ t('home.overdueMore', { n: counts.overdue - overdue.length }) }}
            </NuxtLink>
          </div>
        </div>

        <UAlert
          v-if="renewal"
          color="info"
          variant="subtle"
          icon="i-lucide-calendar-clock"
          :title="renewal.days === 0 ? t('home.renewalToday', { plan: renewal.plan }) : t('home.renewal', { plan: renewal.plan, n: renewal.days })"
          :actions="[{ label: t('home.renewalAction'), to: localePath('/app/billing'), color: 'info', variant: 'outline' }]"
        />

        <HomeMoments :summary="summary" />

        <UCard v-if="canRead">
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
          <USkeleton
            v-if="!upcomingReady"
            class="h-24 w-full"
          />
          <EmptyState
            v-else-if="!upcoming.length"
            compact
            icon="i-lucide-calendar-plus"
            :title="t('home.noUpcoming')"
            :description="t('home.noUpcomingHint')"
            :action="auth.hasAbility('posts.write') ? { label: t('posts.create'), to: localePath('/app/compose'), icon: 'i-lucide-plus' } : undefined"
          />
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
      </div>

      <div class="space-y-6 min-w-0">
        <div
          v-if="summary"
          class="grid grid-cols-2 gap-3 lg:grid-cols-1"
        >
          <div class="rounded-lg border border-default p-4 space-y-1">
            <NuxtLink
              :to="localePath('/app/analytics')"
              class="block hover:opacity-80"
            >
              <p class="text-2xl font-semibold text-highlighted">
                <TickNumber
                  :value="shown.clicks"
                  :format="n => formatCompact(n, locale)"
                  show-up
                />
              </p>
              <p class="text-sm text-muted">
                {{ t('home.clicksWeek') }}
              </p>
            </NuxtLink>
            <div
              v-if="!summary.clicks7d"
              class="pt-1 space-y-2"
            >
              <p class="text-xs text-muted">
                {{ t('home.noClicks') }}
              </p>
              <CopyButton
                v-if="summary.bioUrl"
                :text="summary.bioUrl"
                :label="t('home.copyEtalase')"
                size="xs"
              />
              <UButton
                v-else
                :to="localePath('/app/bio')"
                size="xs"
                variant="outline"
                color="neutral"
                :label="t('home.openEtalase')"
              />
            </div>
          </div>
          <div class="rounded-lg border border-default p-4 space-y-1">
            <NuxtLink
              :to="localePath('/app/auto-reply/activity')"
              class="block hover:opacity-80"
            >
              <p class="text-2xl font-semibold text-highlighted">
                <TickNumber
                  :value="shown.replies"
                  :format="n => formatCompact(n, locale)"
                  show-up
                />
              </p>
              <p class="text-sm text-muted">
                {{ t('home.autoRepliesWeek') }}
              </p>
            </NuxtLink>
            <div
              v-if="!summary.autoReplies7d"
              class="pt-1 space-y-2"
            >
              <p class="text-xs text-muted">
                {{ t('home.noReplies') }}
              </p>
              <UButton
                :to="localePath('/app/auto-reply/new?template=mau')"
                size="xs"
                variant="outline"
                color="neutral"
                :label="t('home.setupAutoReply')"
              />
            </div>
          </div>
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
                <SmartImage
                  :src="product.imageUrl"
                  :title="product.title"
                  class="size-10 rounded shrink-0"
                />
                <span class="text-sm text-default truncate flex-1">{{ product.title || '—' }}</span>
                <span class="text-sm font-semibold text-highlighted">{{ t('home.clicks', { n: product.clicks }) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </UCard>

        <!-- Rencana konten: only once the onboarding checklist is done or hidden, so the newcomer path stays as it is. -->
        <WeekCard v-if="canRead && !showChecklist" />

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
    </div>

    <WelcomeSheet
      v-model:open="welcome"
      :name="profile.user.name.split(' ')[0] ?? ''"
      :onboarding="profile.onboarding"
    />
  </div>
</template>
