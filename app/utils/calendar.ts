import type { Platform } from '#shared/channels/types'
import type { ContentPillar, PlannerIdea, PlannerMoment } from '#shared/utils/planner'
import { isOverdue } from '../../shared/utils/overdue'
import { zonedParts } from './schedule'

/** One post target in GET /api/app/posts/calendar. */
export interface CalendarEntry {
  id: string
  postId: string
  platform: Platform
  status: string
  scheduledAt: string
  removedAt: string | null
  caption: string
  pillar: ContentPillar | null
  /** The post's first photo, or a video's poster frame; `url` is null while a video has no poster yet. */
  thumbnail?: { url: string | null, kind: 'image' | 'video' } | null
  username?: string | null
}
/**
 * One chip per post per day; `removed`: platforms where the published post was later deleted (found by a sync).
 * `scheduledAt`: the earliest target's instant (what a move restores); `overdue`: a scheduled target is past its time.
 */
export interface DayPost {
  postId: string
  time: string
  caption: string
  platforms: Platform[]
  removed: Platform[]
  status: string
  scheduledAt: string
  overdue: boolean
  /** Picture for the chip (null: none yet); `video`: the first media is a video. `accounts`: the target usernames. */
  thumb?: string | null
  video?: boolean
  accounts?: string[]
}
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
      if (isOverdue(entry.status, entry.scheduledAt)) existing.overdue = true
      if (entry.username && !existing.accounts?.includes(entry.username)) existing.accounts = [...(existing.accounts ?? []), entry.username]
    } else {
      list.push({
        postId: entry.postId, time, caption: entry.caption, platforms: [entry.platform], removed, status: entry.status, scheduledAt: entry.scheduledAt,
        overdue: isOverdue(entry.status, entry.scheduledAt),
        thumb: entry.thumbnail?.url ?? null, video: entry.thumbnail?.kind === 'video', accounts: entry.username ? [entry.username] : []
      })
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
const STATUS_EDGE: Record<string, string> = { published: 'border-l-success', failed: 'border-l-error', scheduled: 'border-l-info', draft: 'border-l-muted' }
/** The coloured left edge of a calendar chip: the same status colours as `postDot`. */
export const postEdge = (post: Pick<DayPost, 'status' | 'overdue'>) => post.overdue ? 'border-l-warning' : STATUS_EDGE[post.status] ?? 'border-l-warning'
export const allRemoved = (post: DayPost) => post.removed.length > 0 && new Set(post.removed).size === new Set(post.platforms).size

/** Classes for a Kalender day while something is dragged (`usePlannerDrop().state`), and just after a drop landed. */
export function dropCellClass(state: 'ok' | 'past' | 'target' | 'blocked' | null, settled: boolean): string {
  const byState = {
    ok: 'bg-primary/10 ring-2 ring-inset ring-primary',
    past: 'animate-shake bg-error/5',
    target: 'outline-1 outline-dashed -outline-offset-4 outline-primary/40',
    blocked: 'opacity-50'
  } as const
  return `${state ? byState[state] : ''} ${settled ? 'animate-glow' : ''}`
}
