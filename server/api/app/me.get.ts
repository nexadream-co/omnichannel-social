import { creatorProfile } from '../../core/access'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return creatorProfile(ctx.db, ctx.access, ctx.session)
})
