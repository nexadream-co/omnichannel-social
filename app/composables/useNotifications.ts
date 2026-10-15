export interface NotificationItem {
  id: string
  title: string
  body: string
  actionUrl: string | null
  icon: string | null
  level: 'info' | 'success' | 'warning' | 'error'
  readAt: string | null
  createdAt: string
}

/** Shared by the bell and the notifications page: one fetch, one badge (docs/blueprint/11 §2). */
export function useNotifications(audience: 'creator' | 'staff') {
  const base = audience === 'creator' ? '/api/app/notifications' : '/api/admin/notifications'
  const items = useState<NotificationItem[]>(`notifications:${audience}:items`, () => [])
  const unreadCount = useState<number>(`notifications:${audience}:unread`, () => 0)
  const loaded = useState<boolean>(`notifications:${audience}:loaded`, () => false)

  async function refresh() {
    try {
      const response = await apiFetch<{ items: NotificationItem[], unreadCount: number }>(base, { query: { limit: 10 } })
      items.value = response.items
      unreadCount.value = response.unreadCount
      loaded.value = true
    } catch {
      // the bell stays quiet on errors
    }
  }

  async function markRead(id: string) {
    const item = items.value.find(n => n.id === id)
    if (item && !item.readAt) {
      item.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    await apiFetch(`${base}/${id}/read`, { method: 'POST' }).catch(() => undefined)
  }

  async function markAllRead() {
    await apiFetch(`${base}/read-all`, { method: 'POST' })
    items.value = items.value.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    unreadCount.value = 0
  }

  /** Refetch on focus and every 60 s while the tab is visible. Call once per shell. */
  function startPolling() {
    if (import.meta.server) return
    refresh()
    const onFocus = () => refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 60_000)
    window.addEventListener('focus', onFocus)
    onScopeDispose(() => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    })
  }

  return { items, unreadCount, loaded, refresh, markRead, markAllRead, startPolling, base }
}
