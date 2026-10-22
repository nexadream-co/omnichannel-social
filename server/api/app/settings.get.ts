import { eq } from 'drizzle-orm'
import { workspaces } from '../../core/db/schema'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const [row] = await ctx.db.select({
    name: workspaces.name, timezone: workspaces.timezone, niche: workspaces.niche, affiliatePrograms: workspaces.affiliatePrograms, watermark: workspaces.watermark, deleteRequestedAt: workspaces.deleteRequestedAt
  }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  return row
})
