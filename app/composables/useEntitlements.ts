import type { FeatureKey, LimitKey } from '#shared/utils/plans'

interface Entitlements {
  planSlug: string
  planName: string
  status: string
  limits: Record<LimitKey, number>
  features: Record<FeatureKey, boolean>
}

/** Fetched once per page load; refreshed after plan-changing actions (docs/blueprint/06 §6). */
export function useEntitlements() {
  const data = useState<Entitlements | null>('entitlements', () => null)
  const loading = useState<Promise<void> | null>('entitlements:pending', () => null)

  async function load(force = false) {
    if (data.value && !force) return
    loading.value ??= apiFetch<Entitlements>('/api/app/entitlements')
      .then((value) => {
        data.value = value
      })
      .catch(() => undefined)
      .finally(() => {
        loading.value = null
      })
    await loading.value
  }

  const has = (feature: FeatureKey) => Boolean(data.value?.features[feature])
  return { data, load, has }
}
