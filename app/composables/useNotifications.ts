export interface NotificationItem {
  id: string
  title: string
  body: string
  actionUrl: string | null
  icon: string | null
  level: 'info' | 'success' | 'warning' | 'error'
  templateKey: string | null
  readAt: string | null
  createdAt: string
}

/** Consecutive identical rows (same template, title and body) shown once with a count. */
export interface NotificationGroup {
  key: string
  item: NotificationItem
  /** Every row folded into this one, newest first. */
  ids: string[]
  unreadIds: string[]
  count: number
}

export function collapseNotifications(list: NotificationItem[]): NotificationGroup[] {
  const groups: NotificationGroup[] = []
  for (const item of list) {
    const last = groups[groups.length - 1]
    const same = last && item.templateKey && last.item.templateKey === item.templateKey && last.item.title === item.title && last.item.body === item.body
    if (same) {
      last.ids.push(item.id)
      if (!item.readAt) last.unreadIds.push(item.id)
      last.count++
    } else {
      groups.push({ key: item.id, item, ids: [item.id], unreadIds: item.readAt ? [] : [item.id], count: 1 })
    }
  }
  return groups
}

export type NotificationBucket = 'today' | 'week' | 'older'

/** Today, the last seven days, or older; compared in the viewer's local calendar. */
export function notificationBucket(createdAt: string, now: Date = new Date()): NotificationBucket {
  const created = new Date(createdAt)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (created.getTime() >= startOfToday) return 'today'
  if (created.getTime() >= startOfToday - 6 * 86_400_000) return 'week'
  return 'older'
}

/** Shared by the bell and the notifications page: one fetch, one badge (docs/blueprint/11 §2). */
export function useNotifications(audience: 'creator' | 'staff') {
  const base = audience === 'creator' ? '/api/app/notifications' : '/api/admin/notifications'
  const items = useState<NotificationItem[]>(`notifications:${audience}:items`, () => [])
  const unreadCount = useState<number>(`notifications:${audience}:unread`, () => 0)
  const loaded = useState<boolean>(`notifications:${audience}:loaded`, () => false)

  /** Set while a "mark all read" waits to be committed: polls must not bring the badge back, and the commit only covers rows seen so far. */
  const readAllPending = useState<boolean>(`notifications:${audience}:readAllPending`, () => false)
  const readAllBefore = useState<string | null>(`notifications:${audience}:readAllBefore`, () => null)

  async function refresh() {
    if (readAllPending.value) return
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

  /** Marks everything read on screen at once; returns the function that puts it back. */
  function readAllLocally(): () => void {
    const before = { items: items.value, unread: unreadCount.value }
    readAllPending.value = true
    readAllBefore.value = new Date().toISOString()
    items.value = items.value.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    unreadCount.value = 0
    return () => {
      readAllPending.value = false
      items.value = before.items
      unreadCount.value = before.unread
    }
  }

  async function commitReadAll() {
    const before = readAllBefore.value ?? new Date().toISOString()
    try {
      await apiFetch(`${base}/read-all`, { method: 'POST', body: { before } })
    } finally {
      readAllPending.value = false
    }
    await refresh()
  }

  async function markAllRead() {
    await apiFetch(`${base}/read-all`, { method: 'POST', body: { before: new Date().toISOString() } })
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

  return { items, unreadCount, loaded, refresh, markRead, markAllRead, readAllLocally, commitReadAll, startPolling, base }
}

/** What a notification row does: the visible action label, and "mark read, then go there" for a row or a folded group. */
export function useNotificationActions(audience: 'creator' | 'staff') {
  const { t, te } = useI18n()
  const localePath = useLocalePath()
  const bell = useNotifications(audience)

  const actionLabel = (item: NotificationItem) => item.templateKey && te(`notifications.actions.${item.templateKey}`) ? t(`notifications.actions.${item.templateKey}`) : t('common.open')

  async function open(group: NotificationGroup, onRead?: (ids: string[]) => void) {
    const ids = group.unreadIds
    await Promise.all(ids.map(id => bell.markRead(id)))
    onRead?.(ids)
    const url = group.item.actionUrl
    if (url) await navigateTo(audience === 'creator' && url.startsWith('/app') ? localePath(url) : url)
  }

  return { actionLabel, open }
}
