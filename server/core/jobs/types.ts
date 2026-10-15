import type { CoreContext } from '../context'

export interface ClaimedJob {
  id: string
  queue: string
  payload: Record<string, unknown>
  workspaceId: string | null
  attempts: number
  maxAttempts: number
  runAt: Date
}

/** Return { deferUntil } to requeue without counting an attempt (rate limit, quota, kill switch). */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- most handlers return nothing
export type JobResult = void | { deferUntil: Date }

export type JobHandler = (job: ClaimedJob, ctx: CoreContext) => Promise<JobResult>

/** Thrown for errors that a retry can't fix: the job goes straight to `dead`. */
export class PermanentJobError extends Error {
  override name = 'PermanentJobError'
}
