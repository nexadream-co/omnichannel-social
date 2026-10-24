import { useDebounceFn } from '@vueuse/core'
import { draftBackupKey, draftKey, parseDraft, serialiseDraft, type ComposeDraft } from '~/utils/compose-draft'

/**
 * Keeps the composer's words in this browser (localStorage, per workspace) so a closed tab or a slip of the thumb
 * costs nothing. Everything is best effort: private windows and blocked storage just mean no draft.
 */
export function useComposeDraft(workspaceId: () => string | undefined) {
  const key = () => {
    const id = workspaceId()
    return id ? draftKey(id) : null
  }

  function read(): ComposeDraft | null {
    const k = key()
    if (!k) return null
    try {
      return parseDraft(localStorage.getItem(k))
    } catch {
      return null
    }
  }

  function clear() {
    const k = key()
    if (!k) return
    try {
      localStorage.removeItem(k)
    } catch {
      // storage unavailable
    }
  }

  let enabled = false
  const write = useDebounceFn((snapshot: Omit<ComposeDraft, 'savedAt'>) => {
    const k = key()
    if (!k || !enabled) return
    try {
      const raw = serialiseDraft(snapshot)
      if (raw) localStorage.setItem(k, raw)
      else localStorage.removeItem(k)
    } catch {
      // storage unavailable or full
    }
  }, 800)

  /** Starts saving (call once the composer has loaded and the draft offer was answered). */
  function save(snapshot: Omit<ComposeDraft, 'savedAt'>) {
    enabled = true
    write(snapshot)
  }

  /** Moves the stored draft aside before a newer one is written over it (see `release`). */
  function stash() {
    const id = workspaceId()
    if (!id) return
    try {
      const raw = localStorage.getItem(draftKey(id))
      if (raw) localStorage.setItem(draftBackupKey(id), raw)
    } catch {
      // storage unavailable
    }
  }

  /** On leaving: a stashed draft comes back when the newer text is gone (submitted or emptied), otherwise it is dropped. */
  function release() {
    const id = workspaceId()
    if (!id) return
    try {
      const backup = localStorage.getItem(draftBackupKey(id))
      if (!backup) return
      if (!localStorage.getItem(draftKey(id))) localStorage.setItem(draftKey(id), backup)
      localStorage.removeItem(draftBackupKey(id))
    } catch {
      // storage unavailable
    }
  }
  if (getCurrentScope()) onScopeDispose(release)

  /** Stops pending saves and removes the stored draft (after a successful submit). */
  function discard() {
    enabled = false
    clear()
  }

  return { read, save, stash, clear: discard }
}
