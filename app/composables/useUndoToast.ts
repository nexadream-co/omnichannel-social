export interface UndoRunOptions {
  title: string
  description?: string
  /** Local optimistic change, synchronous. */
  apply?: () => void
  /** Restores local state (on undo or on failure). */
  rollback?: () => void
  commit: () => Promise<unknown>
  /** Present: "now" mode (commit first, undo reverses it). Absent: "deferred" mode (commit after the toast). */
  undo?: () => Promise<unknown>
  duration?: number
}

interface Pending {
  commit: () => Promise<void>
  timer: ReturnType<typeof setTimeout>
}

/** Optimistic change with an "Urungkan" toast. Deferred commits flush when the page goes away or another run starts. */
export function useUndoToast() {
  const toast = useToast()
  const { t } = useI18n()
  const pending = new Set<Pending>()

  const fail = (caught: unknown) => toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })

  async function flush(): Promise<void> {
    const items = [...pending]
    pending.clear()
    for (const item of items) clearTimeout(item.timer)
    await Promise.all(items.map(item => item.commit()))
  }

  async function run(opts: UndoRunOptions): Promise<void> {
    await flush()
    const duration = opts.duration ?? 6000
    opts.apply?.()

    if (opts.undo) {
      try {
        await opts.commit()
      } catch (caught) {
        opts.rollback?.()
        fail(caught)
        return
      }
      toast.add({
        title: opts.title,
        description: opts.description,
        duration,
        actions: [{
          label: t('common.undo'),
          color: 'neutral',
          variant: 'outline',
          onClick: async () => {
            opts.rollback?.()
            try {
              await opts.undo!()
              toast.add({ title: t('undo.restored'), color: 'success' })
            } catch {
              toast.add({ title: t('undo.failed'), color: 'error' })
            }
          }
        }]
      })
      return
    }

    // The toast's own closing drives the commit (it pauses on hover, focus and window blur); a timer slightly
    // after its lifetime is the fallback. Whatever commits first also removes the toast, so "Urungkan" never outlives the commit.
    const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let undone = false
    let started = false
    const entry: Pending = {
      timer: setTimeout(() => void entry.commit(), duration + 3000),
      commit: async () => {
        if (started) return
        started = true
        pending.delete(entry)
        clearTimeout(entry.timer)
        toast.remove(id)
        if (undone) return
        try {
          await opts.commit()
        } catch (caught) {
          opts.rollback?.()
          fail(caught)
        }
      }
    }
    pending.add(entry)
    toast.add({
      id,
      title: opts.title,
      description: opts.description,
      duration,
      ...{ 'onUpdate:open': (open: boolean) => {
        if (!open) void entry.commit()
      } },
      actions: [{
        label: t('common.undo'),
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          if (started || undone) {
            toast.add({ title: t('undo.tooLate'), color: 'neutral' })
            return
          }
          undone = true
          started = true
          pending.delete(entry)
          clearTimeout(entry.timer)
          toast.remove(id)
          opts.rollback?.()
        }
      }]
    })
  }

  if (getCurrentScope()) onScopeDispose(() => void flush())
  return { run, flush }
}
