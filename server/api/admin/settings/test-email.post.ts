import { sendTestEmail, testEmailSchema } from '../../../core/admin/settings'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.write')
  return sendTestEmail(ctx, await readValidatedJson(event, testEmailSchema))
})
