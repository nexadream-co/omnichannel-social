import { recordMilestone } from '../../../core/milestones'

export default defineEventHandler(async event => recordMilestone(await requireWorkspaceContext(event), getRouterParam(event, 'key') ?? ''))
