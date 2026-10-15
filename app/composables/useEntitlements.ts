import { FEATURE_KEYS, type FeatureKey, type LimitKey } from '#shared/utils/plans'

export interface EntitlementsPayload {
  planSlug: string
  planName: string
  effectivePlanSlug: string
  status: string
  limits: Record<LimitKey, number>
  features: Record<FeatureKey, boolean>
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  graceEndsAt: string | null
  currentPeriodEnd: string | null
  isTrialing: boolean
  isInGrace: boolean
  usage: Partial<Record<LimitKey, number>>
}

interface UpgradeDialogState { open: boolean, message: string | null, feature: FeatureKey | null }

/** One fetch per page load, refreshed after mutations that change usage (docs/blueprint/06 §6). */
export function useEntitlements() {
  const data = useState<EntitlementsPayload | null>('entitlements', () => null)
  const pending = useState<Promise<void> | null>('entitlements:pending', () => null)
  const upgradeDialog = useState<UpgradeDialogState>('upgrade-dialog', () => ({ open: false, message: null, feature: null }))

  async function load(force = false) {
    if (data.value && !force) return
    pending.value ??= apiFetch<EntitlementsPayload>('/api/app/entitlements')
      .then((value) => {
        data.value = value
      })
      .catch(() => undefined)
      .finally(() => {
        pending.value = null
      })
    await pending.value
  }

  const can = (feature: FeatureKey) => Boolean(data.value?.features[feature])
  const limit = (key: LimitKey) => data.value?.limits[key] ?? 0
  const isUnlimited = (key: LimitKey) => limit(key) === -1
  const used = (key: LimitKey) => data.value?.usage[key] ?? 0
  const remaining = (key: LimitKey) => (isUnlimited(key) ? Infinity : Math.max(0, limit(key) - used(key)))
  const atLimit = (key: LimitKey) => !isUnlimited(key) && used(key) >= limit(key)
  const hasEveryFeature = computed(() => Boolean(data.value) && FEATURE_KEYS.every(key => data.value!.features[key]))

  function upgradeRequired(feature: FeatureKey | null = null, message: string | null = null) {
    upgradeDialog.value = { open: true, message, feature }
  }

  /** 402 → opens the dialog with the server's sentence; returns true when handled. */
  function handlePlanError(caught: unknown): boolean {
    if (extractStatusCode(caught) !== 402) return false
    upgradeRequired((caught as { data?: { data?: { feature?: FeatureKey } } })?.data?.data?.feature ?? null, extractErrorMessage(caught, ''))
    void load(true)
    return true
  }

  return { data, load, can, has: can, limit, isUnlimited, used, remaining, atLimit, hasEveryFeature, upgradeDialog, upgradeRequired, handlePlanError }
}
