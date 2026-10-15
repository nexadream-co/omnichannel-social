import { getRule } from '../../../../core/autoreply/rules'

export default defineEventHandler(async event => getRule(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
