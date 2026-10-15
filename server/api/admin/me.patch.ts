import { staffProfileSchema, updateStaffProfile } from '../../core/account'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  return updateStaffProfile(ctx, await readValidatedJson(event, staffProfileSchema))
})
