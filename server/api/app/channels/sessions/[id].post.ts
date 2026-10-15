import { z } from 'zod'
import { completeConnectSession } from '../../../../core/social-accounts'

const schema = z.object({ externalIds: z.array(z.string().min(1)).min(1, 'Pilih minimal satu akun.').max(50) })

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  requireNotImpersonating(ctx)
  const { externalIds } = await readValidatedJson(event, schema)
  return completeConnectSession(ctx, getRouterParam(event, 'id') ?? '', externalIds)
})
