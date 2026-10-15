import { getLink } from '../../../core/links/service'

export default defineEventHandler(async event => getLink(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
