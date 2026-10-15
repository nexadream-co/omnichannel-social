import { getMedia } from '../../../core/media/service'

export default defineEventHandler(async event => getMedia(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
