import { impersonateStaff } from '../../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requireSuperAdmin(event)
  const { setCookies } = await impersonateStaff(ctx, getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'cookie') ?? '')
  for (const cookie of setCookies) appendResponseHeader(event, 'set-cookie', cookie)
  return { redirect: '/admin/dashboard' }
})
