import { useEventListener } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

/** Asks before leaving a page with unsaved work (route change or closing the tab). */
export function useUnsavedChanges(dirty: MaybeRefOrGetter<boolean>) {
  const { t } = useI18n()
  const { confirm } = useConfirmDialog()
  let allowed = false

  onBeforeRouteLeave(async () => {
    if (allowed || !toValue(dirty)) return true
    const leave = await confirm({
      title: t('unsaved.title'),
      description: t('unsaved.body'),
      confirmLabel: t('unsaved.leave'),
      cancelLabel: t('unsaved.stay'),
      color: 'error'
    })
    return leave
  })

  if (import.meta.client) {
    useEventListener(window, 'beforeunload', (event) => {
      if (allowed || !toValue(dirty)) return
      event.preventDefault()
    })
  }

  /** Call right before a programmatic navigation that follows a save. */
  function allowNextLeave() {
    allowed = true
    setTimeout(() => {
      allowed = false
    }, 1000)
  }

  return { allowNextLeave }
}
