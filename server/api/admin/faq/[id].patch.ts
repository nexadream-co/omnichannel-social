import { faqPatchSchema, updateFaq } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'faq.write')
  await updateFaq(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, faqPatchSchema))
  return { ok: true }
})
