import { updateWorkspaceSettings, workspaceSettingsSchema } from '../../core/account'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateWorkspaceSettings(ctx, await readValidatedJson(event, workspaceSettingsSchema))
})
