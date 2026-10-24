export type DowngradeReason = 'unpaid' | 'trial_ended' | 'cancelled'

/** Label map for why a workspace fell to Gratis; the text lives in i18n `billing.downgrade.<reason>`. */
export const DOWNGRADE_REASON_META: Record<DowngradeReason, { i18nKey: string, icon: string }> = {
  unpaid: { i18nKey: 'billing.downgrade.unpaid', icon: 'i-lucide-circle-alert' },
  trial_ended: { i18nKey: 'billing.downgrade.trial_ended', icon: 'i-lucide-hourglass' },
  cancelled: { i18nKey: 'billing.downgrade.cancelled', icon: 'i-lucide-circle-slash' }
}

/** Maps the event that moved a workspace to Gratis to its reason (docs/blueprint/07 §1). */
export function downgradeReason(transition: string, fromStatus: string | null): DowngradeReason | null {
  if (transition === 'trial_expired') return 'trial_ended'
  if (transition === 'grace_expired') return fromStatus === 'cancelled' ? 'cancelled' : 'unpaid'
  return null
}

export interface KeepCandidate { id: string, status: string, createdAt: string, upcomingPosts?: number, activeRules?: number }

/** Ids to preselect when the owner must pick which accounts stay active: most at stake first, then active before disabled, then oldest. */
export function rankAccountsToKeep(accounts: KeepCandidate[], limit: number): string[] {
  const weight = (a: KeepCandidate) => (a.upcomingPosts ?? 0) + (a.activeRules ?? 0) * 2
  return [...accounts]
    .sort((a, b) => weight(b) - weight(a)
      || Number(b.status === 'active') - Number(a.status === 'active')
      || a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(0, limit))
    .map(a => a.id)
}
