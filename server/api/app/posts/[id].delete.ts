import { deletePost } from '../../../core/publishing/service'

export default defineEventHandler(async event => deletePost(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
