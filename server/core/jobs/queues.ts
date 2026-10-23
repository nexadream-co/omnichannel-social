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
  'media.watchdog': queue('media.watchdog', { maxAttempts: 3 }),
  'media.purge': queue('media.purge', { maxAttempts: 5, concurrency: 2 }),
  // publish.target polls containers inline for up to 15 s, so it needs a longer lease and budget.
  'publish.target': queue('publish.target', { maxAttempts: 4, leaseSeconds: 180, expectedMs: 30_000, concurrency: 10 }),
  'publish.poll': queue('publish.poll', { maxAttempts: 4, concurrency: 10 }),
  'publish.reconcile': queue('publish.reconcile', { maxAttempts: 4, concurrency: 5 }),
  'links.unfurl': queue('links.unfurl', { maxAttempts: 2, concurrency: 3 }),
  'webhook.meta': queue('webhook.meta', { maxAttempts: 5, concurrency: 10 }),
  // A DM is never blindly retried: the worker claims the event first, so retries only re-check and defer.
  'dm.send': queue('dm.send', { maxAttempts: 3, concurrency: 10 }),
  'billing.daily': queue('billing.daily', { maxAttempts: 3, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  'insights.daily': queue('insights.daily', { maxAttempts: 2, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  'insights.sync': queue('insights.sync', { maxAttempts: 1, leaseSeconds: 300, expectedMs: 30_000, concurrency: 2 }),
  'engagement.inactivity': queue('engagement.inactivity', { maxAttempts: 2, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  'billing.renewal-reminders': queue('billing.renewal-reminders', { maxAttempts: 3, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  // Planner reminders (bell only): pages of 200 workspaces, re-enqueued with a cursor.
  'planner.weekly': queue('planner.weekly', { maxAttempts: 2, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  'planner.reminders': queue('planner.reminders', { maxAttempts: 2, leaseSeconds: 300, expectedMs: 30_000, concurrency: 1 }),
  // Best effort: a failed lookup leaves the tag without numbers, so one attempt is enough.
  'hashtags.signals': queue('hashtags.signals', { maxAttempts: 1, expectedMs: 15_000, concurrency: 3 })
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
