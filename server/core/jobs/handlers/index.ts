import type { JobHandler } from '../types'
import { mediaWatchdogJob, processMediaJob } from '../../media/service'
import { unfurlLinkJob } from '../../links/unfurl-job'
import { dataDeletionJob } from '../../meta-callbacks'
import { publishPollJob, publishReconcileJob, publishTargetJob } from '../../publishing/pipeline'
import { purge } from './maintenance'
import { noop } from './system'
import { tokenRefresh, tokenRefreshOne } from './token'

/** Queue name → handler. Domain handlers join here milestone by milestone (docs/blueprint/15 §2). */
export const handlers: Record<string, JobHandler> = {
  'system.noop': noop,
  'maintenance.purge': purge,
  'meta.data_deletion': dataDeletionJob,
  'token.refresh': tokenRefresh,
  'token.refresh.one': tokenRefreshOne,
  'media.process': processMediaJob,
  'media.watchdog': mediaWatchdogJob,
  'publish.target': publishTargetJob,
  'publish.poll': publishPollJob,
  'publish.reconcile': publishReconcileJob,
  'links.unfurl': unfurlLinkJob
}
