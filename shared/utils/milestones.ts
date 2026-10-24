/** First-time moments a workspace celebrates once (stored in workspaces.milestones, see server/core/milestones.ts). */
export const MILESTONE_KEYS = ['firstAccountConnected', 'firstPostScheduled', 'firstPostPublished', 'firstClick', 'firstAutoDm', 'checklistComplete', 'etalasePublished', 'upgradePaid', 'clicks100', 'clicks1000', 'clicks10000'] as const
export type MilestoneKey = typeof MILESTONE_KEYS[number]

/** Per-week target celebration, keyed by the Monday of that week. */
export const WEEK_TARGET_KEY = /^weekTarget:\d{4}-\d{2}-\d{2}$/

export function isMilestoneKey(key: string): boolean {
  return (MILESTONE_KEYS as readonly string[]).includes(key) || WEEK_TARGET_KEY.test(key)
}
