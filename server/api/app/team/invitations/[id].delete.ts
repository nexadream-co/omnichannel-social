import { revokeInvitation } from '../../../../core/team'

export default defineEventHandler(async event => revokeInvitation(await requireWorkspaceContext(event), getRouterParam(event, 'id') ?? ''))
