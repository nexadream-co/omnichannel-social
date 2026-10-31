/**
 * JSON-lines logger over console (docs/blueprint/19 §2 rule 11). Every host captures stdout.
 * Field names follow pino conventions so logs stay greppable if pino is ever swapped in.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const REDACT = /token|secret|password|authorization|cookie/i

function scrub(fields: Fields): Fields {
  const out: Fields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT.test(key)) out[key] = '[redacted]'
    else if (value instanceof Error) out[key] = { name: value.name, message: value.message, stack: value.stack }
    else out[key] = value
  }
  return out
}

/** Lines kept between drains; beyond this an instance that never drains (a script, a test) drops the rest instead of growing. */
const MAX_BUFFERED = 500
let buffered: Fields[] = []

/** Warn and error lines are kept for the app_logs table (server/core/app-logs.ts); info and debug stay on stdout only. */
function write(level: Level, msg: string, fields: Fields = {}) {
  const entry = { level, time: new Date().toISOString(), msg, ...scrub(fields) }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  if ((level === 'warn' || level === 'error') && buffered.length < MAX_BUFFERED) buffered.push(entry)
}

/** Hands over (and clears) the warn/error lines logged since the last call. */
export function takeBufferedLogs(): Fields[] {
  const batch = buffered
  buffered = []
  return batch
}

export interface Logger {
  debug(msg: string, fields?: Fields): void
  info(msg: string, fields?: Fields): void
  warn(msg: string, fields?: Fields): void
  error(msg: string, fields?: Fields): void
  child(fields: Fields): Logger
}

export function createLogger(base: Fields = {}): Logger {
  return {
    debug: (msg, fields) => {
      if (process.env.LOG_LEVEL === 'debug') write('debug', msg, { ...base, ...fields })
    },
    info: (msg, fields) => write('info', msg, { ...base, ...fields }),
    warn: (msg, fields) => write('warn', msg, { ...base, ...fields }),
    error: (msg, fields) => write('error', msg, { ...base, ...fields }),
    child: fields => createLogger({ ...base, ...fields })
  }
}

export const log = createLogger()
