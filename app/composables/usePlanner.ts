import { momentName, type PlannerMoment } from '#shared/utils/planner'

/** What is being dragged on the Kalender: a scheduled post (reschedule) or an idea (move its planned day). */
export type PlannerDrag = { kind: 'post', postId: string, time: string } | { kind: 'idea', id: string }

/**
 * Shared by the Kalender, Bank Ide and the idea editor. Every write goes through apiFetch, so the calendar
 * and the idea lists refresh themselves (onApiMutation on /api/app/planner).
 */
export function usePlanner() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const localePath = useLocalePath()
  const drag = useState<PlannerDrag | null>('planner-drag', () => null)

  const fail = (caught: unknown) => toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  const dayLabel = (day: string) => formatDate(`${day}T12:00:00Z`, { locale: locale.value, timeZone: 'UTC' })

  async function planIdea(id: string, plannedOn: string | null) {
    try {
      await apiFetch(`/api/app/planner/ideas/${id}`, { method: 'PATCH', body: { plannedOn } })
      toast.add({ title: plannedOn ? t('planner.idea.planned', { date: dayLabel(plannedOn) }) : t('planner.idea.saved'), color: 'success' })
      return true
    } catch (caught) {
      fail(caught)
      return false
    }
  }

  async function archiveIdea(id: string) {
    try {
      await apiFetch(`/api/app/planner/ideas/${id}`, { method: 'DELETE' })
      toast.add({ title: t('planner.idea.archived'), color: 'success' })
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

  return { drag, dayLabel, planIdea, archiveIdea, restoreIdea, prepareMoment, repeatPost, toPost, fail }
}
