import { settingsPatchSchema, updateAdminSettings } from '../../../core/admin/settings'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.write')
  return updateAdminSettings(ctx, await readValidatedJson(event, settingsPatchSchema))
})
