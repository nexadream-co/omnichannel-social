import { listFaqs } from '../../../core/admin/content'

export default defineEventHandler(async event => listFaqs(await requirePermission(event, 'faq.read')))
