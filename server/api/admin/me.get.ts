import { staffProfile } from '../../core/access'
import { getSetting } from '../../core/settings'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  return staffProfile(ctx.access, ctx.session, await getSetting('display.timezone'))
})
