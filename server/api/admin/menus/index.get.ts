import { listMenus } from '../../../core/admin/people'

export default defineEventHandler(async event => listMenus(await requirePermission(event, 'menus.read')))
