import { eq, sql } from 'drizzle-orm'
import { SETTINGS_BY_KEY, SETTINGS_CATALOG } from '../../shared/utils/settings'
import { decrypt, encrypt } from './crypto'
import { getDb, type Executor } from './db/client'
import { appSettings } from './db/schema'

const TTL_MS = 60_000
const cacheKey = Symbol.for('socialz.settings')
type GlobalWithSettings = typeof globalThis & { [cacheKey]?: { at: number, values: Record<string, string> } }

/** The only door to app_settings (docs/blueprint/10 §4). Per-instance cache, 60 s, best effort. */
export async function getAllSettings(db: Executor = getDb()): Promise<Record<string, string>> {
  const g = globalThis as GlobalWithSettings
  const hit = g[cacheKey]
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values
  const values: Record<string, string> = Object.fromEntries(SETTINGS_CATALOG.map(def => [def.key, def.default]))
  const rows = await db.select({ key: appSettings.key, value: appSettings.value, isSecret: appSettings.isSecret }).from(appSettings)
  for (const row of rows) {
    if (row.value === null) continue
    values[row.key] = row.isSecret ? decrypt(row.value) : row.value
  }
  g[cacheKey] = { at: Date.now(), values }
  return values
}

export function invalidateSettingsCache() {
  (globalThis as GlobalWithSettings)[cacheKey] = undefined
}

export async function getSetting(key: string, db?: Executor): Promise<string> {
  const all = await getAllSettings(db)
  return all[key] ?? SETTINGS_BY_KEY[key]?.default ?? ''
}

export async function getSettingNumber(key: string, fallback = 0, db?: Executor): Promise<number> {
  const value = Number(await getSetting(key, db))
  return Number.isFinite(value) ? value : fallback
}

export async function getSettingBool(key: string, db?: Executor): Promise<boolean> {
  const value = await getSetting(key, db)
  return value === 'true' || value === '1'
}

export async function getSettingJson<T>(key: string, fallback: T, db?: Executor): Promise<T> {
  try {
    return JSON.parse(await getSetting(key, db)) as T
  } catch {
    return fallback
  }
}

function rowFor(key: string, value: string) {
  const def = SETTINGS_BY_KEY[key]
  const isSecret = Boolean(def?.isSecret)
  return {
    key,
    value: isSecret && value ? encrypt(value) : value,
    group: def?.group ?? 'system',
    type: def?.type ?? 'string',
    label: def?.label ?? key,
    isSecret
  }
}

export async function setSettings(entries: Record<string, string>, db: Executor = getDb()): Promise<number> {
  const rows = Object.entries(entries).map(([key, value]) => rowFor(key, value))
  if (!rows.length) return 0
  await db.insert(appSettings).values(rows).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: sql`excluded.value`, updatedAt: sql`now()` }
  })
  invalidateSettingsCache()
  return rows.length
}

export async function setSetting(key: string, value: string, db?: Executor): Promise<void> {
  await setSettings({ [key]: value }, db)
}

/**
 * Atomic compare-and-set, usable as a durable "once" marker. Returns true when this caller set the value.
 * Stored in group 'system' (not in the catalog), so the admin form never shows it.
 */
export async function claimSettingValue(key: string, value: string, db: Executor = getDb()): Promise<boolean> {
  const updated = await db.update(appSettings)
    .set({ value, updatedAt: new Date() })
    .where(sql`${appSettings.key} = ${key} and ${appSettings.value} is distinct from ${value}`)
    .returning({ key: appSettings.key })
  if (updated.length) return true
  const existing = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, key))
  if (existing.length) return false
  const inserted = await db.insert(appSettings)
    .values({ key, value, group: 'system', type: 'string', label: key, isSecret: false })
    .onConflictDoNothing()
    .returning({ key: appSettings.key })
  return inserted.length > 0
}
