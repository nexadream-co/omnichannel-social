import { cancelPost } from '../../../../core/publishing/service'

export default defineEventHandler(async event => cancelPost(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
