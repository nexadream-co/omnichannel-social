import { MILESTONE_KEYS, isMilestoneKey, type MilestoneKey } from '#shared/utils/milestones'

type Key = MilestoneKey | `weekTarget:${string}`

/** First-time moments (confetti once). The server keeps the first timestamp; the profile is marked locally at once. */
export function useMilestones() {
  const auth = useCreatorAuth()
  const milestones = computed<Record<string, string>>(() => auth.profile.value?.milestones ?? {})

  const has = (key: Key) => Boolean(milestones.value[key])
  const at = (key: Key) => milestones.value[key] ?? null

  /** True only the first time on this workspace. Celebrate only when it returns true. */
  function reach(key: Key): boolean {
    const profile = auth.profile.value
    if (!profile || profile.impersonating || has(key) || !isMilestoneKey(key)) return false
    auth.profile.value = { ...profile, milestones: { ...profile.milestones, [key]: new Date().toISOString() } }
    apiFetch(`/api/app/milestones/${encodeURIComponent(key)}`, { method: 'POST' }).catch(() => undefined)
    return true
  }

  return { milestones, has, at, reach, keys: MILESTONE_KEYS }
}
