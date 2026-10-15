import type { JobHandler } from '../types'
import { purge } from './maintenance'
import { noop } from './system'

/** Queue name → handler. Domain handlers join here milestone by milestone (docs/blueprint/15 §2). */
export const handlers: Record<string, JobHandler> = {
  'system.noop': noop,
  'maintenance.purge': purge
}
