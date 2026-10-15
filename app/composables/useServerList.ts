export interface ListMeta { page: number, limit: number, total: number, pageCount: number }
type ListResponse<T> = { items: T[], meta: ListMeta } & Record<string, unknown>

/**
 * Server-paginated list (docs/blueprint/13 §6): debounced search, filter change resets to page 1,
 * refetch when a mutation hits the same API topic.
 */
export function useServerList<T>(endpoint: string | (() => string), options: { limit?: number, filters?: Ref<Record<string, unknown>>, debounceMs?: number } = {}) {
  const items = shallowRef<T[]>([])
  const page = ref(1)
  const limit = ref(options.limit ?? 20)
  const search = ref('')
  const total = ref(0)
  const pageCount = ref(1)
  const extra = shallowRef<Record<string, unknown>>({})
  const status = ref<'idle' | 'loading' | 'error' | 'success'>('idle')
  const error = ref<unknown>(null)
  const url = () => typeof endpoint === 'function' ? endpoint() : endpoint
  let sequence = 0

  async function refresh() {
    const current = ++sequence
    status.value = 'loading'
    try {
      const query: Record<string, unknown> = { page: page.value, limit: limit.value, ...options.filters?.value }
      if (search.value.trim()) query.search = search.value.trim()
      const response = await apiFetch<ListResponse<T>>(url(), { query })
      if (current !== sequence) return
      const { items: rows, meta, ...rest } = response
      items.value = rows
      total.value = meta.total
      pageCount.value = meta.pageCount
      extra.value = rest
      status.value = 'success'
    } catch (caught) {
      if (current !== sequence) return
      error.value = caught
      status.value = 'error'
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(search, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      page.value = 1
      refresh()
    }, options.debounceMs ?? 300)
  })
  watch(page, refresh)
  if (options.filters) {
    watch(options.filters, () => {
      if (page.value === 1) refresh()
      else page.value = 1
    }, { deep: true })
  }

  const topic = url().split('?')[0]!.split('/').slice(0, 4).join('/')
  const stop = onApiMutation(changed => changed === topic && refresh())
  onScopeDispose(() => {
    stop()
    clearTimeout(timer)
  })

  return { items, page, limit, search, total, pageCount, extra, status, error, refresh }
}
