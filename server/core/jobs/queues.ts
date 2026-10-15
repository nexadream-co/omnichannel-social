/** Every queue is declared once here (docs/blueprint/15 §1.7). A queue without a handler is never enqueued. */
export interface QueueDef {
  name: string
  maxAttempts: number
  leaseSeconds: number
  expectedMs: number
  concurrency: number
}

const DEFAULTS = { maxAttempts: 5, leaseSeconds: 120, expectedMs: 10_000, concurrency: 5 }

function queue(name: string, options: Partial<Omit<QueueDef, 'name'>> = {}): QueueDef {
  return { name, ...DEFAULTS, ...options }
}

export const QUEUES = {
  'system.noop': queue('system.noop', { maxAttempts: 1, expectedMs: 1_000 }),
  'maintenance.purge': queue('maintenance.purge', { maxAttempts: 3, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  'meta.data_deletion': queue('meta.data_deletion', { maxAttempts: 5 }),
  'token.refresh': queue('token.refresh', { maxAttempts: 3, concurrency: 1 }),
  'token.refresh.one': queue('token.refresh.one', { maxAttempts: 4 }),
  'media.process': queue('media.process', { maxAttempts: 4 }),
  'media.watchdog': queue('media.watchdog', { maxAttempts: 3 })
} as const satisfies Record<string, QueueDef>

export type QueueName = keyof typeof QUEUES

export function queueDef(name: string): QueueDef {
  return (QUEUES as Record<string, QueueDef>)[name] ?? queue(name)
}

/** Exponential backoff with jitter: ~30 s, 2 min, 8 min, 30 min… */
export function backoffMs(attempts: number): number {
  const base = 30_000 * 4 ** Math.max(0, attempts - 1)
  const capped = Math.min(base, 2 * 60 * 60 * 1000)
  return Math.round(capped * (0.8 + Math.random() * 0.4))
}
