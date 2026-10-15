<script setup lang="ts">
import type { FeatureKey, LimitKey } from '#shared/utils/plans'
import { PAYMENT_STATUS_KEYS, type PaymentStatusValue } from '#shared/utils/payments'

interface Payment { id: string, orderId: string, amount: number, status: PaymentStatusValue, planSlug: string | null, period: 'monthly' | 'yearly', paymentType: string | null, redirectUrl: string | null, paidAt: string | null, expiresAt: string | null, createdAt: string }
interface PlanCard { slug: string, name: string, description: string | null, priceMonthly: number, priceYearly: number, limits: Record<LimitKey, number>, features: Record<FeatureKey, boolean>, trialDays: number }
interface View {
  subscription: { status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'downgraded' | 'suspended', period: 'monthly' | 'yearly', trialEndsAt: string | null, currentPeriodEnd: string | null, graceEndsAt: string | null, cancelledAt: string | null, plan: { slug: string, name: string } }
  effectivePlan: { slug: string, name: string }
  renewalReminderDays: number
  plans: PlanCard[]
  pendingPayments: Payment[]
  checkoutAvailable: boolean
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
useHead({ title: () => t('billing.title') })

const view = ref<View | null>(null)
const period = ref<'monthly' | 'yearly'>('monthly')
const history = ref<{ items: Payment[], meta: { page: number, limit: number, total: number } } | null>(null)
const historyPage = ref(1)
const busy = ref<string | null>(null)
const impersonating = computed(() => auth.impersonating.value)

async function load() {
  const [v, h] = await Promise.all([
    apiFetch<View>('/api/app/subscription'),
    apiFetch<{ items: Payment[], meta: { page: number, limit: number, total: number } }>('/api/app/subscription/payments', { query: { page: historyPage.value, limit: 10 } })
  ])
  view.value = v
  history.value = h
  if (v.subscription.status === 'active' || v.subscription.status === 'cancelled') period.value = v.subscription.period
}
watch(historyPage, load)

/** Back from the hosted page: the URL is not proof of payment, so read our own record (07 §3.2). */
async function handleReturn() {
  const orderId = typeof route.query.order_id === 'string' ? route.query.order_id : typeof route.query.reference === 'string' ? route.query.reference : null
  if (!orderId) return
  await router.replace({ query: {} })
  const read = () => apiFetch<Payment>('/api/app/subscription/payments/by-order', { query: { orderId } }).catch(() => null)
  let payment = await read()
  if (payment && (payment.status === 'pending' || payment.status === 'challenge')) {
    await new Promise(resolve => setTimeout(resolve, 2500))
    payment = await read()
  }
  if (!payment) return
  if (payment.status === 'paid') toast.add({ title: t('billing.return.paid'), color: 'success', icon: 'i-lucide-circle-check' })
  else if (payment.status === 'pending' || payment.status === 'challenge') toast.add({ title: t('billing.return.pending'), color: 'info' })
  else toast.add({ title: t('billing.return.failed'), color: 'error' })
  await entitlements.load(true)
  await auth.fetchProfile()
}

onMounted(async () => {
  await handleReturn()
  await load()
})

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
const timeFmt = computed(() => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }))
const date = (v: string | null) => (v ? dateFmt.value.format(new Date(v)) : '')
const daysLeft = (v: string | null) => (v ? Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000)) : 0)

const s = computed(() => view.value?.subscription)
const statusColor = computed(() => ({ trialing: 'info', active: 'success', past_due: 'warning', cancelled: 'neutral', downgraded: 'neutral', suspended: 'error' } as const)[s.value?.status ?? 'downgraded'])
const statusLine = computed(() => {
  const sub = s.value
  if (!sub) return ''
  if (sub.status === 'trialing') return t('billing.trialLeft', { plan: sub.plan.name, n: daysLeft(sub.trialEndsAt), date: date(sub.trialEndsAt) })
  if (sub.status === 'past_due') return t('billing.grace', { date: date(sub.graceEndsAt) })
  if (sub.status === 'cancelled') return t('billing.cancelledUntil', { date: date(sub.currentPeriodEnd) })
  if (sub.status === 'active') return daysLeft(sub.currentPeriodEnd) <= (view.value?.renewalReminderDays ?? 7) ? t('billing.renewSoon', { date: date(sub.currentPeriodEnd) }) : t('billing.activeUntil', { date: date(sub.currentPeriodEnd) })
  return t('billing.onFree')
})
const isPaidUp = computed(() => s.value?.status === 'active' || s.value?.status === 'cancelled')

const price = (plan: PlanCard) => (period.value === 'yearly' ? plan.priceYearly : plan.priceMonthly)
const yearlySave = computed(() => {
  const paid = (view.value?.plans ?? []).filter(p => p.priceMonthly > 0 && p.priceYearly > 0)
  if (!paid.length) return 0
  return Math.max(...paid.map(p => Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100)))
})
const periodItems = computed(() => [{ value: 'monthly', label: t('billing.monthly') }, { value: 'yearly', label: yearlySave.value > 0 ? `${t('billing.yearly')} · ${t('billing.yearlySave', { n: yearlySave.value })}` : t('billing.yearly') }])
const { lines: planLines } = usePlanLines()

function buttonFor(plan: PlanCard): { label: string, variant: 'solid' | 'outline' } | null {
  if (price(plan) <= 0) return null
  const current = s.value?.plan.slug === plan.slug && isPaidUp.value
  if (current) return { label: t('billing.renew'), variant: 'outline' }
  return { label: isPaidUp.value ? t('billing.switchTo', { plan: plan.name }) : t('billing.choose', { plan: plan.name }), variant: 'solid' }
}

async function choose(plan: PlanCard) {
  if (!view.value?.checkoutAvailable) return toast.add({ title: t('billing.unavailable'), color: 'warning' })
  const others = view.value.pendingPayments.filter(p => !(p.planSlug === plan.slug && p.period === period.value))
  if (others.length && !await confirm({ title: t('billing.replaceConfirmTitle'), description: t('billing.replaceConfirmBody'), confirmLabel: t('billing.replace') })) return
  busy.value = plan.slug
  try {
    for (const payment of others) await apiFetch(`/api/app/subscription/payments/${payment.id}/cancel`, { method: 'POST' })
    const result = await apiFetch<{ redirectUrl: string, reused: boolean }>('/api/app/subscription/checkout', { method: 'POST', body: { planSlug: plan.slug, period: period.value } })
    if (result.reused) toast.add({ title: t('billing.reused'), color: 'info' })
    window.location.href = result.redirectUrl
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
    busy.value = null
    await load()
  }
}

async function cancelPayment(payment: Payment) {
  busy.value = payment.id
  try {
    await apiFetch(`/api/app/subscription/payments/${payment.id}/cancel`, { method: 'POST' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    busy.value = null
    await load()
  }
}

async function cancelSubscription() {
  if (!await confirm({ title: t('billing.cancelSubTitle'), description: t('billing.cancelSubBody'), confirmLabel: t('billing.cancelSub'), color: 'error' })) return
  await apiFetch('/api/app/subscription/cancel', { method: 'POST' })
  toast.add({ title: t('billing.cancelled'), color: 'success' })
  await load()
}
async function resume() {
  await apiFetch('/api/app/subscription/resume', { method: 'POST' })
  toast.add({ title: t('billing.resumed'), color: 'success' })
  await load()
  await entitlements.load(true)
}

const planName = (slug: string | null) => view.value?.plans.find(p => p.slug === slug)?.name ?? slug ?? ''
const paymentColor = (status: PaymentStatusValue) => (status === 'paid' ? 'success' : status === 'pending' || status === 'challenge' ? 'info' : status === 'refunded' ? 'warning' : 'neutral')
</script>

<template>
  <div class="w-full max-w-5xl mx-auto space-y-6">
    <CommandBar
      :title="t('billing.title')"
      :description="t('billing.subtitle')"
    />

    <div
      v-if="!view"
      class="space-y-4"
    >
      <USkeleton class="h-28 w-full" />
      <div class="grid gap-4 md:grid-cols-3">
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-80 w-full"
        />
      </div>
    </div>

    <template v-else>
      <UAlert
        v-if="impersonating"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-cog"
        :title="t('billing.impersonating')"
      />
      <UAlert
        v-else-if="!view.checkoutAvailable"
        color="warning"
        variant="subtle"
        icon="i-lucide-plug-zap"
        :title="t('billing.unavailable')"
      />

      <!-- Current plan -->
      <UCard>
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-xs text-muted uppercase tracking-wide">
              {{ t('billing.current') }}
            </p>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-semibold text-highlighted">
                {{ s!.status === 'downgraded' ? view.effectivePlan.name : s!.plan.name }}
              </h2>
              <UBadge
                v-if="s!.status !== 'downgraded'"
                :color="statusColor"
                variant="subtle"
                :label="t(`billing.status.${s!.status}`)"
              />
            </div>
            <p
              class="text-sm"
              :class="s!.status === 'past_due' ? 'text-warning' : 'text-muted'"
            >
              {{ statusLine }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <UButton
              v-if="s!.status === 'cancelled'"
              :label="t('billing.resume')"
              :disabled="impersonating"
              @click="resume"
            />
            <UButton
              v-if="['active', 'trialing', 'past_due'].includes(s!.status) && s!.status !== 'trialing'"
              color="neutral"
              variant="ghost"
              :label="t('billing.cancelSub')"
              :disabled="impersonating"
              @click="cancelSubscription"
            />
          </div>
        </div>
      </UCard>

      <!-- Unfinished payments: always the complete list, never paged -->
      <UCard
        v-if="view.pendingPayments.length"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <h2 class="font-semibold text-highlighted flex items-center gap-2">
            <UIcon
              name="i-lucide-clock"
              class="size-4 text-info"
            />{{ t('billing.pending') }}
          </h2>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="payment in view.pendingPayments"
            :key="payment.id"
            class="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p class="text-sm text-default flex-1">
              {{ t('billing.pendingBody', { plan: planName(payment.planSlug), period: payment.period === 'yearly' ? t('billing.yearly') : t('billing.monthly'), amount: formatIDR(payment.amount, locale), time: payment.expiresAt ? timeFmt.format(new Date(payment.expiresAt)) : '—' }) }}
            </p>
            <div class="flex gap-2">
              <UButton
                v-if="payment.redirectUrl"
                :to="payment.redirectUrl"
                external
                size="sm"
                :label="t('billing.continuePay')"
                :disabled="impersonating"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                :label="t('billing.cancelPay')"
                :loading="busy === payment.id"
                :disabled="impersonating"
                @click="cancelPayment(payment)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Plans -->
      <div class="space-y-4">
        <div class="flex justify-center">
          <UTabs
            v-model="period"
            :items="periodItems"
            :content="false"
          />
        </div>
        <div :class="view.plans.length >= 3 ? 'grid gap-4 md:grid-cols-3' : 'grid gap-4 md:grid-cols-2 max-w-3xl mx-auto w-full'">
          <UCard
            v-for="plan in view.plans"
            :key="plan.slug"
            :class="s!.plan.slug === plan.slug && s!.status !== 'downgraded' ? 'ring-2 ring-primary' : ''"
            :ui="{ body: 'flex flex-col h-full gap-4' }"
          >
            <div>
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-lg font-semibold text-highlighted">
                  {{ plan.name }}
                </h3>
                <UBadge
                  v-if="s!.plan.slug === plan.slug && s!.status !== 'downgraded'"
                  size="sm"
                  variant="subtle"
                  :label="t('billing.current')"
                />
              </div>
              <p
                v-if="plan.description"
                class="text-sm text-muted mt-1"
              >
                {{ plan.description }}
              </p>
            </div>
            <p>
              <span class="text-3xl font-bold text-highlighted">{{ price(plan) > 0 ? formatIDR(price(plan), locale) : t('billing.free') }}</span>
              <span
                v-if="price(plan) > 0"
                class="text-sm text-muted"
              >{{ period === 'yearly' ? t('billing.perYear') : t('billing.perMonth') }}</span>
            </p>
            <ul class="space-y-1.5 text-sm flex-1">
              <li
                v-for="line in planLines(plan)"
                :key="line"
                class="flex gap-2"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-4 text-primary shrink-0 mt-0.5"
                />
                <span class="text-default">{{ line }}</span>
              </li>
            </ul>
            <UButton
              v-if="buttonFor(plan)"
              block
              size="lg"
              :variant="buttonFor(plan)!.variant"
              :label="buttonFor(plan)!.label"
              :loading="busy === plan.slug"
              :disabled="impersonating || !view.checkoutAvailable || (busy !== null && busy !== plan.slug)"
              @click="choose(plan)"
            />
          </UCard>
        </div>
        <p class="text-xs text-muted text-center">
          {{ t('billing.methods') }}
        </p>
      </div>

      <!-- History -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="font-semibold text-highlighted">
            {{ t('billing.history') }}
          </h2>
        </template>
        <p
          v-if="!history?.items.length"
          class="p-6 text-sm text-muted text-center"
        >
          {{ t('billing.historyEmpty') }}
        </p>
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="payment in history.items"
            :key="payment.id"
            class="px-4 py-3 flex items-center gap-3"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm text-default">
                {{ planName(payment.planSlug) }} · {{ payment.period === 'yearly' ? t('billing.yearly') : t('billing.monthly') }}
              </p>
              <p class="text-xs text-muted truncate">
                {{ formatDateTime(payment.createdAt, { locale }) }} · {{ payment.orderId }}
              </p>
            </div>
            <div class="text-right shrink-0 space-y-1">
              <p class="text-sm font-medium text-highlighted">
                {{ formatIDR(payment.amount, locale) }}
              </p>
              <UBadge
                size="sm"
                variant="subtle"
                :color="paymentColor(payment.status)"
                :label="t(PAYMENT_STATUS_KEYS[payment.status])"
              />
            </div>
          </li>
        </ul>
        <div
          v-if="history && history.meta.total > history.meta.limit"
          class="flex justify-center p-3 border-t border-default"
        >
          <UPagination
            v-model:page="historyPage"
            :total="history.meta.total"
            :items-per-page="history.meta.limit"
          />
        </div>
      </UCard>
    </template>
  </div>
</template>
