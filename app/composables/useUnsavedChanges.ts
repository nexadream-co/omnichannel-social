import { useEventListener } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

interface UnsavedChangesOptions {
  /** Offers "Simpan draf" in the leave dialog; resolves true when saved, so the navigation goes on. */
  saveDraft?: () => Promise<boolean>
}

/** Asks before leaving a page with unsaved work (route change or closing the tab). */
export function useUnsavedChanges(dirty: MaybeRefOrGetter<boolean>, options: UnsavedChangesOptions = {}) {
  const { t } = useI18n()
  const { choose } = useConfirmDialog()
  let allowed = false

  onBeforeRouteLeave(async () => {
    if (allowed || !toValue(dirty)) return true
    const choice = await choose({
      title: t('unsaved.title'),
      description: options.saveDraft ? t('unsaved.draftBody') : t('unsaved.body'),
      confirmLabel: t('unsaved.leave'),
      cancelLabel: t('unsaved.stay'),
      color: 'error',
      ...(options.saveDraft ? { extraLabel: t('unsaved.saveDraft'), extraIcon: 'i-lucide-file-pen-line' } : {})
    })
    if (choice === 'extra' && options.saveDraft) return options.saveDraft()
    return choice === 'confirm'
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
