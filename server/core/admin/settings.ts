import { z } from 'zod'
import { MASKED_SECRET, SETTINGS_BY_KEY, SETTINGS_CATALOG } from '../../../shared/utils/settings'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { appSettings } from '../db/schema'
import { isEmailConfigured, sendEmail } from '../email'
import { appError } from '../errors'
import { getAllSettings, setSettings } from '../settings'

const KILL_SWITCHES = new Set(['channels.publishing.paused', 'channels.autoReply.enabled'])

/** GET /api/admin/settings: catalog + values; secrets come back as the mask or '' — never the value (docs/blueprint/10 §5). */
export async function getAdminSettings(ctx: StaffContext) {
  assertPermission(ctx, 'settings.read')
  const values = await getAllSettings(ctx.db)
  const stored = new Set((await ctx.db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)).filter(r => r.value).map(r => r.key))
  const out: Record<string, string> = {}
  for (const def of SETTINGS_CATALOG) {
    out[def.key] = def.isSecret ? (stored.has(def.key) && values[def.key] ? MASKED_SECRET : '') : (values[def.key] ?? def.default)
  }
  return { catalog: SETTINGS_CATALOG, values: out }
}

export const settingsPatchSchema = z.object({ values: z.record(z.string(), z.string()) })

export async function updateAdminSettings(ctx: StaffContext, input: z.infer<typeof settingsPatchSchema>) {
  assertPermission(ctx, 'settings.write')
  const before = await getAllSettings(ctx.db)
  const updates: Record<string, string> = {}
  for (const [key, raw] of Object.entries(input.values)) {
    const def = SETTINGS_BY_KEY[key]
    if (!def) continue // a stale form can't fail the save
    if (def.isSecret && raw === MASKED_SECRET) continue
    const value = def.type === 'boolean' ? String(raw === 'true') : raw
    if (def.type === 'select' && !def.options?.some(o => o.value === value)) continue
    if (def.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
      throw appError(400, `${def.label} harus berupa angka.`, 'VALIDATION_FAILED', { field: key })
    }
    if (def.type === 'json') {
      try {
        JSON.parse(value)
      } catch {
        throw appError(400, `${def.label} bukan JSON yang valid.`, 'VALIDATION_FAILED', { field: key })
      }
    }
    updates[key] = value
  }
  const count = await setSettings(updates, ctx.db)
  const changedKeys = Object.keys(updates).filter(key => before[key] !== updates[key])
  if (changedKeys.length) {
    await recordAudit(ctx, {
      audience: 'staff', action: 'settings.update', actorId: ctx.staffUserId, actorName: ctx.staffName,
      metadata: { keys: changedKeys.map(key => (SETTINGS_BY_KEY[key]?.isSecret ? `${key} (rahasia)` : key)) }
    })
  }
  for (const key of changedKeys.filter(k => KILL_SWITCHES.has(k))) {
    await recordAudit(ctx, {
      audience: 'staff', action: 'channels.kill_switch', actorId: ctx.staffUserId, actorName: ctx.staffName,
      metadata: { key, from: before[key], to: updates[key] }
    })
  }
  return { success: true, updated: count }
}

export const testEmailSchema = z.object({ to: z.email('Format email tidak valid.') })

export async function sendTestEmail(ctx: StaffContext, input: z.infer<typeof testEmailSchema>) {
  assertPermission(ctx, 'settings.write')
  if (!(await isEmailConfigured())) throw appError(409, 'Simpan pengaturan email terlebih dahulu.', 'CONFLICT')
  const result = await sendEmail(ctx, {
    to: input.to,
    subject: 'Email uji dari Socialz.id',
    html: '<p>Halo! Pengaturan email Socialz.id sudah benar. Email ini dikirim dari halaman Pengaturan back-office.</p>'
  })
  if (!result.sent) throw appError(502, result.error || 'Email gagal dikirim.', 'SERVER_ERROR')
  return { success: true }
}
