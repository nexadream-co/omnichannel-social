import { getEntitlements } from '../../core/entitlements'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { planSlug, planName, status, limits, features } = await getEntitlements(ctx.workspaceId, ctx.access.workspace.entitlementsVersion, ctx.db)
  return { planSlug, planName, status, limits, features }
})
