import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped after-response deferral for libraries that only accept a global callback
 * (better-auth's advanced.backgroundTasks). Our own core code receives ctx.defer instead.
 * node:async_hooks is part of the Node baseline and of Cloudflare's nodejs_compat.
 */
interface Scope {
  defer: (work: Promise<unknown>) => void
}

const storage = new AsyncLocalStorage<Scope>()

export function runInRequestScope<T>(scope: Scope, fn: () => T): T {
  return storage.run(scope, fn)
}

export function deferInScope(work: Promise<unknown>): void {
  const scope = storage.getStore()
  if (scope) scope.defer(work)
  else void work.catch(error => console.error(JSON.stringify({ level: 'error', msg: 'defer.unscoped_failed', error: String(error) })))
}
