import { listPermissionCatalog } from '../../../core/admin/people'

export default defineEventHandler(async event => listPermissionCatalog(await requirePermission(event, 'permissions.read')))
