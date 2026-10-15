import { z } from 'zod'
import { appError } from '../../../core/errors'
import { setInitialPassword } from '../../../core/services/auth'

const schema = z.object({ newPassword: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(128) })

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  requireNotImpersonating(ctx)
  const { newPassword } = await readValidatedJson(event, schema)
  await setInitialPassword(new Headers(getRequestHeaders(event) as Record<string, string>), newPassword)
    .catch(() => {
      throw appError(409, 'Akun ini sudah punya kata sandi. Pakai menu ubah kata sandi.', 'CONFLICT')
    })
  return { success: true }
})
