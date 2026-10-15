import { staffMenuTree } from '../../../core/access'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  return { items: await staffMenuTree(ctx.db, ctx.access) }
})
