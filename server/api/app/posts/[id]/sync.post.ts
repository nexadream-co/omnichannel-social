import { syncPost } from '../../../../core/engagement-jobs'

export default defineEventHandler(async event => syncPost(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
