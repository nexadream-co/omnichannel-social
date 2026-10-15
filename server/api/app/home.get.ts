import { homeSummary } from '../../core/analytics/service'

export default defineEventHandler(async event => homeSummary(await requireWorkspaceContext(event)))
