import { canWorkspaceRole, type WorkspaceAbility, type WorkspaceRoleSlug } from '#shared/utils/workspace-abilities'

export interface CreatorProfile {
  user: {
    id: string
    name: string
    email: string
    phone: string | null
    image: string | null
    locale: string
    emailVerified: boolean
    workspaceRole: WorkspaceRoleSlug
    abilities: WorkspaceAbility[]
    hasPassword: boolean
  }
  workspace: { id: string, name: string, slug: string, status: string, timezone: string, onboardingCompletedAt: string | null, needsAccountSelection: boolean }
  subscription: { status: string, planSlug: string, planName: string, trialEndsAt: string | null, currentPeriodEnd: string | null }
  onboarding: { accountConnected: boolean, bioCreated: boolean, linkAdded: boolean, postScheduled: boolean, autoReplyAdded: boolean, dismissed: boolean }
  milestones: Record<string, string>
  displayTimezone: string
  impersonating: boolean
}

export function useCreatorAuth() {
  const base = useAuthClient<CreatorProfile>({
    audience: 'creator',
    basePath: '/api/app/auth',
    profileEndpoint: '/api/app/me',
    loginRoute: '/app/auth/login',
    homeRoute: '/app'
  })
  const workspace = computed(() => base.profile.value?.workspace ?? null)
  const emailVerified = computed(() => Boolean(base.profile.value?.user.emailVerified))
  const impersonating = computed(() => Boolean(base.profile.value?.impersonating))

  function hasAbility(ability: WorkspaceAbility): boolean {
    const role = base.profile.value?.user.workspaceRole
    return role ? canWorkspaceRole(role, ability) : false
  }

  async function signUp(input: { name: string, email: string, password: string, phone?: string, acceptTerms: boolean }) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await apiFetch('/api/app/register', { method: 'POST', body: { ...input, timezone } })
    await base.fetchProfile()
  }

  function signInWithGoogle(redirect = '/app') {
    return base.client().signIn.social({ provider: 'google', callbackURL: redirect, errorCallbackURL: '/app/auth/login' })
  }

  async function verifyEmail(token: string) {
    const { error } = await base.client().verifyEmail({ query: { token } })
    if (!error) await base.fetchProfile()
    return { ok: !error, code: error?.code }
  }

  async function resendVerification(email: string) {
    const { error } = await base.client().sendVerificationEmail({ email, callbackURL: '/app' })
    return { ok: !error, code: error?.code }
  }

  return { ...base, workspace, emailVerified, impersonating, hasAbility, signUp, signInWithGoogle, verifyEmail, resendVerification }
}
