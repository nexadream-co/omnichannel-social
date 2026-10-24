/** Route boundary guard; both consoles are client-only (docs/blueprint/13 §3). */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  // Locale prefix from `to`, not useLocalePath(): that reads useRoute(), which is stale inside middleware (Nuxt E2005).
  const prefix = /^\/en(?=\/|$)/.test(to.path) ? '/en' : ''
  const localePath = (target: string) => `${prefix}${target}`
  const path = to.path.replace(/^\/en(?=\/|$)/, '') || '/'
  const isCreator = path === '/app' || path.startsWith('/app/')
  const isStaff = path === '/admin' || path.startsWith('/admin/')
  if (!isCreator && !isStaff) return
  const isAuthRoute = path.startsWith('/app/auth') || path.startsWith('/admin/auth')

  if (isCreator) {
    const auth = useCreatorAuth()
    await auth.init()
    if (isAuthRoute) {
      // verify-email works signed in or out; accept-invite may be for another membership
      const openWhileSignedIn = ['/app/auth/accept-invite', '/app/auth/verify-email']
      if (auth.isAuthenticated.value && !openWhileSignedIn.includes(path)) return navigateTo(localePath('/app'))
      return
    }
    if (!auth.isAuthenticated.value) {
      return navigateTo({ path: localePath('/app/auth/login'), query: path === '/app' ? undefined : { redirect: to.fullPath } })
    }
    // No hard redirect after a downgrade: the excess accounts are already off, so the accounts page only asks which ones stay.
    return
  }

  const auth = useStaffAuth()
  await auth.init()
  if (isAuthRoute) {
    if (auth.isAuthenticated.value) return navigateTo('/admin/dashboard')
    return
  }
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/admin/auth/login', query: path === '/admin' ? undefined : { redirect: to.fullPath } })
  }
})
