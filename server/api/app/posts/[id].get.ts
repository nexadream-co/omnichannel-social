import { getPost } from '../../../core/publishing/service'

export default defineEventHandler(async event => getPost(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
