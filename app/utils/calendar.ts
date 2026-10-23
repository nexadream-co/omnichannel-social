import type { Platform } from '#shared/channels/types'
import type { ContentPillar, PlannerIdea, PlannerMoment } from '#shared/utils/planner'
import { zonedParts } from './schedule'

/** One post target in GET /api/app/posts/calendar. */
export interface CalendarEntry { id: string, postId: string, platform: Platform, status: string, scheduledAt: string, removedAt: string | null, caption: string, pillar: ContentPillar | null }
/** One chip per post per day; `removed`: platforms where the published post was later deleted (found by a sync). */
export interface DayPost { postId: string, time: string, caption: string, platforms: Platform[], removed: Platform[], status: string }
/** `label`: show the moment's name on this day (its first day, or where a row or the view starts); otherwise a tint. */
export interface MomentMark { moment: PlannerMoment, label: boolean }

/** Targets of the same post are grouped into one chip per local day. */
export function groupPostsByDay(entries: CalendarEntry[], tz: string): Map<string, DayPost[]> {
  const map = new Map<string, DayPost[]>()
  for (const entry of entries) {
    const { date, time } = zonedParts(new Date(entry.scheduledAt), tz)
    const list = map.get(date) ?? []
    const existing = list.find(p => p.postId === entry.postId)
    const removed = entry.removedAt ? [entry.platform] : []
    if (existing) {
      existing.platforms.push(entry.platform)
      existing.removed.push(...removed)
      if (entry.status === 'failed') existing.status = 'failed'
    } else {
      list.push({ postId: entry.postId, time, caption: entry.caption, platforms: [entry.platform], removed, status: entry.status })
    }
    map.set(date, list)
  }
  return map
}

export function groupIdeasByDay(ideas: PlannerIdea[]): Map<string, PlannerIdea[]> {
  const map = new Map<string, PlannerIdea[]>()
  for (const idea of ideas) map.set(idea.plannedOn, [...(map.get(idea.plannedOn) ?? []), idea])
  return map
}

export function momentMarks(moments: PlannerMoment[], days: string[]): Map<string, MomentMark[]> {
  const map = new Map<string, MomentMark[]>()
  days.forEach((day, index) => {
    const isMonday = new Date(`${day}T00:00:00Z`).getUTCDay() === 1
    const marks = moments.filter(m => m.startsOn <= day && day <= m.endsOn)
      .map(moment => ({ moment, label: day === moment.startsOn || index === 0 || isMonday }))
    if (marks.length) map.set(day, marks)
  })
  return map
}

const STATUS_DOT: Record<string, string> = { published: 'bg-success', failed: 'bg-error', scheduled: 'bg-info', draft: 'bg-muted' }
export const postDot = (status: string) => STATUS_DOT[status] ?? 'bg-warning'
export const allRemoved = (post: DayPost) => post.removed.length > 0 && new Set(post.removed).size === new Set(post.platforms).size
