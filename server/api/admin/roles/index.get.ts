import { listRoles } from '../../../core/admin/people'

export default defineEventHandler(async event => listRoles(await requirePermission(event, 'roles.read')))
