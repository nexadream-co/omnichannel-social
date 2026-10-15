import { entitlementUsage, getEntitlements } from '../../core/entitlements'

/** Entitlements plus current usage, so the UI can disable a button before the API answers 402 (docs/blueprint/06 §6). */
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const [entitlements, usage] = await Promise.all([
    getEntitlements(ctx.workspaceId, ctx.access.workspace.entitlementsVersion, ctx.db),
    entitlementUsage(ctx.db, ctx.workspaceId, ctx.access.workspace.timezone)
  ])
  const { version: _version, workspaceId: _workspaceId, ...rest } = entitlements
  return { ...rest, usage }
})
