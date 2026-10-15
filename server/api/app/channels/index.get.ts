import { AVAILABLE_PLATFORMS } from '../../../../shared/channels/registry'
import { getAdapter } from '../../../core/channels/registry'
import { listSocialAccounts } from '../../../core/social-accounts'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { items } = await listSocialAccounts(ctx)
  return {
    items,
    platforms: AVAILABLE_PLATFORMS.map(platform => ({ platform, configured: Boolean(getAdapter(platform)?.isConfigured()) }))
  }
})
