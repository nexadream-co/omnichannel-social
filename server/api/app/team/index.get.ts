import { listTeam } from '../../../core/team'

export default defineEventHandler(async event => listTeam(await requireWorkspaceContext(event)))
