import { listPages } from '../../../core/admin/content'

export default defineEventHandler(async event => listPages(await requirePermission(event, 'pages.read')))
