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

function write(level: Level, msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...scrub(fields) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
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
