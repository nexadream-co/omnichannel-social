type Audience = 'creator' | 'staff'
type MutationListener = (topic: string) => void

const listeners = new Set<MutationListener>()
/** Deliberately loose: Nitro's typed-route inference is too deep for a generic wrapper. */
type ApiOptions = { method?: string, body?: unknown, query?: Record<string, unknown>, headers?: Record<string, string>, signal?: AbortSignal }
type ApiClient = (request: string, options?: ApiOptions) => Promise<unknown>

let client: ApiClient | null = null

function audienceFor(url: string): Audience | null {
  if (url.startsWith('/api/admin/')) return 'staff'
  if (url.startsWith('/api/app/')) return 'creator'
  return null
}

function topicFor(url: string): string {
  return url.split('?')[0]!.split('/').slice(0, 4).join('/')
}

/** Lazily created: Nuxt's $fetch is only on globalThis after app init (docs/blueprint/13 §1). */
function getClient(): ApiClient {
  client ??= globalThis.$fetch.create({
    credentials: 'same-origin',
    onResponse({ request, options, response }) {
      const method = (options.method || 'GET').toString().toUpperCase()
      if (response.ok && method !== 'GET' && typeof request === 'string') {
        const topic = topicFor(request)
        for (const listener of listeners) listener(topic)
      }
    },
    async onResponseError({ request, response }) {
      if (response.status !== 401 || typeof request !== 'string' || import.meta.server) return
      const audience = audienceFor(request)
      if (!audience) return
      const auth = audience === 'creator' ? useCreatorAuth() : useStaffAuth()
      auth.reset()
      const route = useRoute()
      if (!route.path.includes('/auth/')) {
        await navigateTo({ path: auth.options.loginRoute, query: { redirect: route.fullPath } })
      }
    }
  }) as unknown as ApiClient
  return client
}

export function apiFetch<T = unknown>(request: string, options?: ApiOptions): Promise<T> {
  return getClient()(request, options) as Promise<T>
}

export function onApiMutation(listener: MutationListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
