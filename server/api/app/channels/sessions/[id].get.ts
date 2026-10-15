import { getConnectSession } from '../../../../core/social-accounts'

export default defineEventHandler(async event => getConnectSession(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
