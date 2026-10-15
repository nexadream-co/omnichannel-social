import { eq, sql } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { SEED_FAQS, SEED_PAGES } from './seed-content'
import { loadDotEnv } from './_env'

loadDotEnv()

/**
 * Idempotent bootstrap of reference data for a FRESH environment (docs/blueprint/02 §4).
 * Releases never run it: later reference data ships in migrations (docs/blueprint/02 §5, 19 §3).
 */
const { closeDb, getDb } = await import('../server/core/db/client')
const schema = await import('../server/core/db/schema')
const { PERMISSION_KEYS, adminPermissionKeys, describePermission, permissionGroupOf, supportPermissionKeys } = await import('../shared/utils/permissions')
const { flattenMenuTree } = await import('../shared/utils/menus')
const { SETTINGS_CATALOG } = await import('../shared/utils/settings')
const { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES } = await import('../shared/utils/templates')
const { SEED_PLANS } = await import('../shared/utils/plans')
const { SCHEDULES } = await import('../server/core/jobs/schedules')
const { baseContext } = await import('../server/core/context')
const { provisionWorkspace } = await import('../server/core/registration')
const { encrypt } = await import('../server/core/crypto')

const db = getDb()
const isProduction = process.env.NUXT_PUBLIC_APP_ENV === 'production'
const step = (name: string) => console.log(`• ${name}`)

step('permissions')
for (const key of PERMISSION_KEYS) {
  await db.insert(schema.permissions).values({ key, group: permissionGroupOf(key), description: describePermission(key) })
    .onConflictDoUpdate({ target: schema.permissions.key, set: { group: permissionGroupOf(key), description: describePermission(key), updatedAt: new Date() } })
}
const permissionRows = await db.select({ id: schema.permissions.id, key: schema.permissions.key }).from(schema.permissions)
const permissionId = new Map(permissionRows.map(row => [row.key, row.id]))

step('roles')
const ROLES = [
  { id: 'role-superadmin', slug: 'superadmin', name: 'Superadmin', description: 'Akses penuh, termasuk menyamar dan tindakan berisiko.', isSuperAdmin: true, keys: PERMISSION_KEYS },
  { id: 'role-admin', slug: 'admin', name: 'Admin', description: 'Semua akses kecuali mengubah peran, hak akses dan menu.', isSuperAdmin: false, keys: adminPermissionKeys() },
  { id: 'role-support', slug: 'support', name: 'Support', description: 'Melihat data dan membantu kreator: pesan masuk dan postingan gagal.', isSuperAdmin: false, keys: supportPermissionKeys() }
]
for (const role of ROLES) {
  const { keys, ...values } = role
  await db.insert(schema.roles).values({ ...values, isSystem: true })
    .onConflictDoUpdate({ target: schema.roles.id, set: { name: values.name, description: values.description, isSuperAdmin: values.isSuperAdmin, isSystem: true, updatedAt: new Date() } })
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, role.id))
  await db.insert(schema.rolePermissions).values(keys.map(key => ({ roleId: role.id, permissionId: permissionId.get(key)! })))
}

step('menus')
for (const row of flattenMenuTree()) {
  await db.insert(schema.menus).values(row)
    .onConflictDoUpdate({ target: schema.menus.id, set: { parentId: row.parentId, label: row.label, path: row.path, icon: row.icon, permissionKey: row.permissionKey, order: row.order, updatedAt: new Date() } })
}

step('settings (defaults only, existing values kept)')
for (const def of SETTINGS_CATALOG) {
  await db.insert(schema.appSettings).values({
    key: def.key,
    value: def.isSecret && def.default ? encrypt(def.default) : def.default,
    group: def.group,
    type: def.type,
    label: def.label,
    isSecret: Boolean(def.isSecret)
  }).onConflictDoUpdate({ target: schema.appSettings.key, set: { group: def.group, type: def.type, label: def.label, isSecret: Boolean(def.isSecret) } })
}

step('email + notification templates')
for (const template of EMAIL_TEMPLATES) {
  const values = { id: `email-${template.key}`, key: template.key, name: template.name, subject: template.subject, body: template.body, description: template.description, variables: template.variables }
  await db.insert(schema.emailTemplates).values(values).onConflictDoUpdate({ target: schema.emailTemplates.key, set: { ...values, updatedAt: new Date() } })
}
for (const template of NOTIFICATION_TEMPLATES) {
  const values = {
    id: `notif-${template.key}`, key: template.key, name: template.name, title: template.title, body: template.body,
    actionLabel: template.actionLabel ?? null, actionUrl: template.actionUrl ?? null, icon: template.icon ?? null,
    level: template.level, variables: template.variables
  }
  await db.insert(schema.notificationTemplates).values(values).onConflictDoUpdate({ target: schema.notificationTemplates.key, set: { ...values, updatedAt: new Date() } })
}

step('plans')
for (const plan of SEED_PLANS) {
  const values = { id: `plan-${plan.slug}`, ...plan, currency: 'IDR' }
  await db.insert(schema.plans).values(values).onConflictDoUpdate({ target: schema.plans.id, set: { ...values, updatedAt: new Date() } })
}

step('payment gateway (inactive, no credentials)')
await db.insert(schema.paymentGateways).values({
  id: 'gateway-nexadream_hub', provider: 'nexadream_hub', label: 'Nexadream Payment Hub', isActive: false, isSandbox: false, baseUrl: 'https://nexadream.id'
}).onConflictDoNothing()

step('job schedules')
for (const schedule of SCHEDULES) {
  await db.insert(schema.jobSchedules).values(schedule)
    .onConflictDoUpdate({ target: schema.jobSchedules.name, set: { cron: schedule.cron, tz: schedule.tz, enabled: schedule.enabled } })
}

step('pages + FAQ')
for (const page of SEED_PAGES) {
  await db.insert(schema.pages).values(page).onConflictDoNothing()
}
const [faqCount] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.faqs)
if (!faqCount?.n) {
  await db.insert(schema.faqs).values(SEED_FAQS.map((faq, order) => ({ ...faq, order })))
}

step('superadmin')
const adminEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'admin@socialz.local').toLowerCase()
const adminPassword = process.env.SEED_SUPERADMIN_PASSWORD || (isProduction ? '' : 'admin12345')
if (!adminPassword) throw new Error('SEED_SUPERADMIN_PASSWORD is required in production')
const [existingAdmin] = await db.select({ id: schema.staffUsers.id }).from(schema.staffUsers).where(eq(schema.staffUsers.email, adminEmail))
if (!existingAdmin) {
  const [admin] = await db.insert(schema.staffUsers).values({ name: 'Superadmin', email: adminEmail, emailVerified: true, roleId: 'role-superadmin' }).returning({ id: schema.staffUsers.id })
  await db.insert(schema.staffAccounts).values({ userId: admin!.id, providerId: 'credential', accountId: admin!.id, password: await hashPassword(adminPassword) })
  console.log(`  created ${adminEmail}${isProduction ? '' : ` / ${adminPassword}`} (change the password after first sign-in)`)
}

if (!isProduction) {
  step('demo creator (dev only)')
  const demoEmail = 'demo@socialz.local'
  const [existingDemo] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, demoEmail))
  if (!existingDemo) {
    const [demo] = await db.insert(schema.users).values({ name: 'Kreator Demo', email: demoEmail, emailVerified: true }).returning({ id: schema.users.id })
    await db.insert(schema.accounts).values({ userId: demo!.id, providerId: 'credential', accountId: demo!.id, password: await hashPassword('demo12345') })
    await provisionWorkspace(baseContext(), demo!.id, { name: 'Kreator Demo', email: demoEmail })
    console.log(`  created ${demoEmail} / demo12345`)
  }
}

await closeDb()
console.log('Seed complete.')
