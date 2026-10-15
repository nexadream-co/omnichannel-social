import { and, asc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeEmail, PASSWORD_MIN_LENGTH, toIndonesianTimezone } from '../../shared/utils/auth'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '../../shared/utils/phone'
import { recordAudit } from './audit'
import type { CoreContext } from './context'
import type { Executor } from './db/client'
import { plans, subscriptionEvents, subscriptions, trialClaims, users, workspaceMembers, workspaces } from './db/schema'
import { sendTemplatedEmail } from './email'
import { invalidateEntitlements } from './entitlements'
import { env } from './env'
import { appError } from './errors'
import { createNotification, notifyStaff } from './notifications'
import { getSetting, getSettingBool } from './settings'

export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama terlalu panjang.'),
  email: z.email('Format email tidak valid.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.').max(128, 'Kata sandi terlalu panjang.'),
  phone: z.string().trim().refine(value => !value || isValidIndonesianPhone(value), 'Nomor HP tidak valid.').optional(),
  timezone: z.string().optional().transform(toIndonesianTimezone),
  acceptTerms: z.literal(true, { error: 'Kamu perlu menyetujui syarat & ketentuan.' })
})
export type RegistrationInput = z.infer<typeof registrationSchema>

export function slugify(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

export async function uniqueWorkspaceSlug(db: Executor, name: string, excludeWorkspaceId?: string): Promise<string> {
  const base = slugify(name) || 'kreator'
  const rows = await db.select({ id: workspaces.id, slug: workspaces.slug }).from(workspaces)
    .where(or(eq(workspaces.slug, base), like(workspaces.slug, `${base}-%`)))
  const taken = new Set(rows.filter(row => row.id !== excludeWorkspaceId).map(row => row.slug))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export interface ProvisionInput {
  name: string
  email: string
  timezone?: string
  viaOAuth?: boolean
}

export interface ProvisionResult {
  workspaceId: string
  created: boolean
  trialGranted: boolean
  planName: string
  trialEndsAt: Date | null
}

/**
 * Creates workspace + owner membership + subscription + signup event (+ trial claim) in ONE transaction.
 * Idempotent: a user who already owns a workspace gets it back (docs/blueprint/05 §2).
 */
export async function provisionWorkspace(ctx: Pick<CoreContext, 'db'>, userId: string, input: ProvisionInput): Promise<ProvisionResult> {
  const existing = await ctx.db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'owner')))
    .orderBy(asc(workspaceMembers.createdAt)).limit(1)
  if (existing[0]) return { workspaceId: existing[0].workspaceId, created: false, trialGranted: false, planName: '', trialEndsAt: null }

  const [trialSlug, defaultSlug, oneTrialPerEmail] = await Promise.all([
    getSetting('billing.trialPlanSlug'),
    getSetting('billing.defaultPlanSlug'),
    getSettingBool('billing.oneTrialPerEmail')
  ])
  const emailNormalized = normalizeEmail(input.email)

  return ctx.db.transaction(async (tx) => {
    const [freePlan] = await tx.select().from(plans).where(eq(plans.slug, defaultSlug)).limit(1)
    if (!freePlan) throw appError(500, 'Paket default belum disiapkan. Hubungi tim Socialz.id.', 'SERVER_ERROR')
    const [trialPlan] = trialSlug ? await tx.select().from(plans).where(and(eq(plans.slug, trialSlug), eq(plans.isActive, true))).limit(1) : []
    const priorClaim = oneTrialPerEmail
      ? (await tx.select({ id: trialClaims.id }).from(trialClaims).where(eq(trialClaims.emailNormalized, emailNormalized)).limit(1))[0]
      : undefined
    const trialGranted = Boolean(trialPlan && trialPlan.trialDays > 0 && !priorClaim)
    const plan = trialGranted ? trialPlan! : freePlan
    const trialEndsAt = trialGranted ? new Date(Date.now() + plan.trialDays * 86_400_000) : null
    const status = trialGranted ? 'trialing' as const : 'downgraded' as const

    const [workspace] = await tx.insert(workspaces).values({
      name: input.name,
      slug: await uniqueWorkspaceSlug(tx, input.name),
      timezone: toIndonesianTimezone(input.timezone),
      dataConsentAcceptedAt: new Date()
    }).returning({ id: workspaces.id })
    const workspaceId = workspace!.id
    await tx.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' })
    await tx.insert(subscriptions).values({ workspaceId, planId: plan.id, status, period: 'monthly', trialEndsAt })
    await tx.insert(subscriptionEvents).values({ workspaceId, transition: 'signup', fromStatus: null, toStatus: status, toPlanSlug: plan.slug, period: 'monthly' })
    if (trialGranted && oneTrialPerEmail) await tx.insert(trialClaims).values({ emailNormalized, workspaceId })
    return { workspaceId, created: true, trialGranted, planName: plan.name, trialEndsAt }
  })
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })

/** Steps 6–9 of docs/blueprint/05 §2, shared by email and Google sign-up. Never throws. */
export async function afterWorkspaceProvisioned(ctx: CoreContext, userId: string, input: ProvisionInput, result: ProvisionResult): Promise<void> {
  if (!result.created) return
  try {
    await invalidateEntitlements(result.workspaceId, ctx.db)
    await createNotification(ctx, { audience: 'creator', userId, workspaceId: result.workspaceId, templateKey: 'welcome', channels: { email: false } })
    if (result.trialGranted && result.trialEndsAt) {
      await createNotification(ctx, {
        audience: 'creator', userId, workspaceId: result.workspaceId, templateKey: 'trial_started',
        variables: { planName: result.planName, trialEndsAt: dateFormat.format(result.trialEndsAt) }, channels: { email: false }
      })
    }
    ctx.defer(sendTemplatedEmail(ctx, 'welcome', input.email, {
      name: input.name,
      workspaceName: input.name,
      loginUrl: `${env().siteUrl}/app/auth/login`,
      onboardingUrl: `${env().siteUrl}/app`
    }))
    await notifyStaff(ctx, 'workspaces.read', {
      templateKey: 'admin_new_workspace',
      variables: { workspaceName: input.name, ownerName: input.name, ownerEmail: input.email, planName: result.planName }
    })
    await recordAudit(ctx, {
      audience: 'creator', action: 'workspace.register', workspaceId: result.workspaceId,
      metadata: { userId, viaOAuth: Boolean(input.viaOAuth), trialGranted: result.trialGranted }
    })
  } catch (error) {
    ctx.log.error('registration.after_provision_failed', { workspaceId: result.workspaceId, error })
  }
}

export interface SignUpPort {
  signUp(input: { name: string, email: string, password: string }, headers: Headers): Promise<{ userId: string, setCookie: string[] }>
  deleteUser(userId: string): Promise<void>
}

/** POST /api/app/register (docs/blueprint/05 §2). */
export async function registerCreator(ctx: CoreContext, input: RegistrationInput, headers: Headers, auth: SignUpPort) {
  if (!(await getSettingBool('app.registrationOpen'))) {
    throw appError(503, 'Pendaftaran sedang ditutup sementara.', 'SERVICE_UNAVAILABLE')
  }
  const email = normalizeEmail(input.email)
  const phone = normalizeIndonesianPhone(input.phone)
  const [emailTaken] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (emailTaken) throw appError(409, 'Email sudah terdaftar. Silakan masuk.', 'CONFLICT', { field: 'email' })
  if (phone) {
    const [phoneTaken] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)
    if (phoneTaken) throw appError(409, 'Nomor HP sudah terdaftar.', 'CONFLICT', { field: 'phone' })
  }

  const { userId, setCookie } = await auth.signUp({ name: input.name, email, password: input.password }, headers)
  if (phone) await ctx.db.update(users).set({ phone }).where(eq(users.id, userId))

  const provisionInput = { name: input.name, email, timezone: input.timezone }
  let result: ProvisionResult
  try {
    result = await provisionWorkspace(ctx, userId, provisionInput)
  } catch (error) {
    ctx.log.error('registration.provision_failed', { error })
    await auth.deleteUser(userId).catch(deleteError => ctx.log.error('registration.compensation_failed', { userId, error: deleteError }))
    throw appError(500, 'Pendaftaran gagal. Coba lagi sebentar lagi.', 'SERVER_ERROR')
  }
  await afterWorkspaceProvisioned(ctx, userId, provisionInput, result)
  return { userId, workspaceId: result.workspaceId, setCookie }
}
