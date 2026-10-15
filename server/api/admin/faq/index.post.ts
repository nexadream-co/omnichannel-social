import { createFaq, faqSchema } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'faq.write')
  await createFaq(ctx, await readValidatedJson(event, faqSchema))
  return { ok: true }
})
