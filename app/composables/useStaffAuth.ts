export interface StaffProfile {
  user: {
    id: string
    name: string
    email: string
    phone: string | null
    image: string | null
    emailVerified: boolean
    role: { id: string, slug: string, name: string, isSuperAdmin: boolean }
    permissions: string[]
  }
  displayTimezone: string
  impersonating: boolean
}

export function useStaffAuth() {
  const base = useAuthClient<StaffProfile>({
    audience: 'staff',
    basePath: '/api/admin/auth',
    profileEndpoint: '/api/admin/me',
    loginRoute: '/admin/auth/login',
    homeRoute: '/admin/dashboard'
  })

  function hasPermission(key: string | string[]): boolean {
    const user = base.profile.value?.user
    if (!user) return false
    if (user.role.isSuperAdmin) return true
    return (Array.isArray(key) ? key : [key]).some(k => user.permissions.includes(k))
  }

  return { ...base, hasPermission }
}
