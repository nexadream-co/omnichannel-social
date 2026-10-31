import { getDb, type Executor } from './db/client'
import { appLogs } from './db/schema'
import { takeBufferedLogs } from './log'

const MAX_FIELDS_CHARS = 16_000
const COLUMNS = new Set(['level', 'time', 'msg', 'userId', 'workspaceId', 'staffUserId', 'requestId', 'path'])

const text = (value: unknown) => typeof value === 'string' && value ? value : null

function toRow(entry: Record<string, unknown>) {
  const rest = Object.fromEntries(Object.entries(entry).filter(([key]) => !COLUMNS.has(key)))
  let fields: unknown = rest
  try {
    const json = JSON.stringify(rest)
    if (json.length > MAX_FIELDS_CHARS) fields = { truncated: true, preview: json.slice(0, MAX_FIELDS_CHARS) }
  } catch {
    fields = { unserializable: true }
  }
  return {
    level: String(entry.level),
    msg: String(entry.msg),
    userId: text(entry.userId),
    workspaceId: text(entry.workspaceId),
    staffUserId: text(entry.staffUserId),
    requestId: text(entry.requestId),
    path: text(entry.path)?.slice(0, 500) ?? null,
    fields,
    createdAt: typeof entry.time === 'string' ? new Date(entry.time) : new Date()
  }
}

/**
 * Writes the warn/error lines buffered by the logger into app_logs. Runs after each response and after deferred
 * work, through waitUntil (docs/blueprint/19 §2). Never throws and never logs through the logger (no loop):
 * a failed batch is dropped, stdout still has every line.
 */
export async function flushLogs(db: Executor = getDb()): Promise<void> {
  const batch = takeBufferedLogs()
  if (!batch.length) return
  try {
    await db.insert(appLogs).values(batch.map(toRow))
  } catch (error) {
    console.warn(JSON.stringify({ level: 'warn', time: new Date().toISOString(), msg: 'log.persist_failed', error: (error as Error).message, lines: batch.length }))
  }
}
