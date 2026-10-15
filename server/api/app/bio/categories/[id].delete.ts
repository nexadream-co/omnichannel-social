import { removeCategory } from '../../../../core/bio/service'

export default defineEventHandler(async event => ({ page: await removeCategory(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? '') }))
