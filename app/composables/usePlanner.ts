import { haptic } from '~/utils/haptics'
import { isPastSlot, zonedParts } from '~/utils/schedule'
import { momentName, type IdeaStage, type PlannerMoment } from '#shared/utils/planner'

/** Local, instant change to the calendar for a move, and how to put it back (undo or a failed save). */
export interface LocalMove { apply: () => void, rollback: () => void }
/**
 * What is being dragged: a scheduled post (reschedule), an idea (move its planned day) or an Ide board card
 * (`from`: the column it was lifted from, `actual`: the stage the idea and its post really are in).
 */
export type PlannerDrag
  = { kind: 'post', postId: string, time: string, scheduledAt: string }
    | { kind: 'idea', id: string, from: string | null }
    | { kind: 'card', id: string, from: IdeaStage, actual: IdeaStage }

/**
 * Shared by the Kalender, Bank Ide and the idea editor. Every write goes through apiFetch, so the calendar
 * and the idea lists refresh themselves (onApiMutation on /api/app/planner).
 */
export function usePlanner() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const localePath = useLocalePath()
  const drag = useState<PlannerDrag | null>('planner-drag', () => null)
  const undoable = useUndoToast()

  const auth = useCreatorAuth()
  const tzOf = () => auth.profile.value?.displayTimezone ?? 'Asia/Jakarta'
  const fail = (caught: unknown) => toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  const dayLabel = (day: string) => formatDate(`${day}T12:00:00Z`, { locale: locale.value, timeZone: 'UTC' })

  /**
   * A day a dragged item may not land on: before today, or, for a post (which keeps its time of day), a time on
   * today that already passed.
   */
  function isPastDrop(day: string, today = zonedParts(new Date(), tzOf()).date) {
    if (day.startsWith('stage:')) return false
    if (day < today) return true
    const item = drag.value
    return item?.kind === 'post' && isPastSlot(day, item.time, tzOf())
  }

  /**
   * `from` given (a move that can be undone): the toast offers "Urungkan", which puts the idea back on `from`.
   * `local`: the calendar's instant change, rolled back on undo or failure.
   */
  async function planIdea(id: string, plannedOn: string | null, from?: string | null, local?: LocalMove) {
    if (from !== undefined) {
      let ok = true
      await undoable.run({
        title: plannedOn ? t('calendar.ideaMovedTo', { day: dayLabel(plannedOn) }) : t('planner.idea.saved'),
        apply: local?.apply,
        commit: () => apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { plannedOn } }),
        undo: () => apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { plannedOn: from } }),
        rollback: () => {
          ok = false
          local?.rollback()
        }
      })
      return ok
    }
    try {
      await apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { plannedOn } })
      toast.add({ title: plannedOn ? t('planner.idea.planned', { date: dayLabel(plannedOn) }) : t('planner.idea.saved'), color: 'success' })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  /** Archives at once; the toast's "Urungkan" reopens the idea. */
  async function archiveIdea(id: string) {
    let ok = true
    await undoable.run({
      title: t('planner.idea.archived'),
      commit: () => apiFetch(`/api/app/planner/ideas/${id}`, { method: 'DELETE' }),
      undo: () => apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { status: 'open' } }),
      rollback: () => {
        ok = false
      }
    })
    return ok
  }

  /** Moves a post to another day or time; the toast's "Urungkan" reschedules it back to `from`. `local`: as in planIdea. */
  async function movePost(postId: string, to: string, from: string, local?: LocalMove) {
    let ok = true
    const at = zonedParts(new Date(to), tzOf())
    await undoable.run({
      title: t('calendar.movedTo', { day: `${dayLabel(at.date)} · ${at.time}` }),
      apply: local?.apply,
      commit: () => apiFetch(`/api/app/posts/${postId}/reschedule`, { method: 'POST', body: { scheduledAt: to } }),
      undo: () => apiFetch(`/api/app/posts/${postId}/reschedule`, { method: 'POST', body: { scheduledAt: from } }),
      rollback: () => {
        ok = false
        local?.rollback()
      }
    })
    if (ok) haptic('success')
    return ok
  }

  /**
   * Puts an Ide board card in `to`, directly below the card `afterId` (null: the top). The same call reorders within a
   * column. `origin` is where it was, so the toast's "Urungkan" puts it back. `local`: the board's instant change (the
   * caller applies it before calling), rolled back on undo or a failed save.
   */
  async function moveStage(id: string, to: IdeaStage, afterId: string | null, origin: { from: IdeaStage, afterId: string | null }, local?: { rollback: () => void }) {
    let ok = true
    await undoable.run({
      title: to === origin.from ? t('ideas.reordered') : t('ideas.movedTo', { stage: t(`ideas.stage.${to}`) }),
      commit: () => apiFetch(`/api/app/planner/ideas/${id}/stage`, { method: 'PATCH', body: { stage: to, afterId } }),
      undo: () => apiFetch(`/api/app/planner/ideas/${id}/stage`, { method: 'PATCH', body: { stage: origin.from, afterId: origin.afterId } }),
      rollback: () => {
        ok = false
        local?.rollback()
      }
    })
    if (ok) haptic('tick')
    return ok
  }

  /** One-line capture into Bank Ide (undated). */
  async function captureIdea(title: string) {
    try {
      await apiFetch('/api/app/planner/ideas', { method: 'POST', body: { title } })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  async function restoreIdea(id: string) {
    try {
      await apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { status: 'open' } })
      toast.add({ title: t('planner.idea.restored'), color: 'success' })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  /** "Siapkan konten": three dated ideas for a shopping moment (Kalender strip, Beranda card). */
  async function prepareMoment(moment: Pick<PlannerMoment, 'id' | 'name' | 'nameEn'>) {
    try {
      await apiFetch(`/api/app/planner/moments/${moment.id}/prepare`, { method: 'POST', body: { locale: locale.value === 'en' ? 'en' : 'id' } })
      toast.add({ title: t('planner.moments.preparedToast', { name: momentName(moment, locale.value) }), color: 'success' })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  /** "Jadikan ide lagi": a post that worked goes back to Bank Ide as an undated idea. */
  async function repeatPost(postId: string) {
    try {
      await apiFetch(`/api/app/planner/ideas/from-post/${postId}`, { method: 'POST', body: { locale: locale.value === 'en' ? 'en' : 'id' } })
      toast.add({
        title: t('planner.idea.repeated'),
        color: 'success',
        actions: [{ label: t('mediaLibrary.toIdeas.openCalendar'), to: localePath('/app/calendar'), color: 'neutral', variant: 'outline' }]
      })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  function toPost(id: string) {
    return navigateTo(localePath({ path: '/app/compose', query: { idea: id } }))
  }

  return { drag, dayLabel, tzOf, isPastDrop, planIdea, archiveIdea, movePost, moveStage, captureIdea, restoreIdea, prepareMoment, repeatPost, toPost, fail }
}
