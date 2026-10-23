import { weekSummary } from '../../../core/planner/shortcuts'

export default defineEventHandler(async event => weekSummary(await requireWorkspaceContext(event)))
