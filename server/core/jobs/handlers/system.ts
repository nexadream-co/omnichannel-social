import type { JobHandler } from '../types'

/** Smoke-test queue: proves enqueue → kick/tick → done end to end (M1 acceptance). */
export const noop: JobHandler = async (job, ctx) => {
  ctx.log.info('job.noop', { payload: job.payload })
}
