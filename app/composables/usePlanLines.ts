import { FEATURE_KEYS, type FeatureKey, type LimitKey } from '#shared/utils/plans'

/** Plan card lines in the visitor's language (billing page + landing pricing share them). */
export function usePlanLines() {
  const { t, locale } = useI18n()
  const LIMITS: LimitKey[] = ['socialAccounts', 'scheduledPostsPerMonth', 'autoReplyDmsPerMonth', 'tagResearchPerMonth', 'bioPages', 'clickRetentionDays']
  // A feature-like limit: a plan without it simply doesn't list it.
  const HIDE_WHEN_ZERO: LimitKey[] = ['tagResearchPerMonth']
  const number = (n: number) => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'id-ID').format(n)
  function lines(plan: { limits: Record<string, number>, features: Record<string, boolean> }): string[] {
    return [
      ...LIMITS.filter(key => !(HIDE_WHEN_ZERO.includes(key) && !plan.limits[key])).map(key => (plan.limits[key] === -1 ? t(`plans.unlimited.${key}`) : t(`plans.limit.${key}`, { n: number(plan.limits[key] ?? 0) }, plan.limits[key] ?? 0))),
      ...FEATURE_KEYS.filter((key: FeatureKey) => plan.features[key]).map(key => t(`plans.feature.${key}`))
    ]
  }
  return { lines }
}
