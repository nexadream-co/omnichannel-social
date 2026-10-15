import { z } from 'zod'
import { selectActiveAccounts } from '../../../core/subscriptions'

/** The blocking "Pilih akun yang tetap aktif" dialog after a downgrade (docs/blueprint/07 §6). */
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { socialAccountIds } = await readValidatedJson(event, z.object({ socialAccountIds: z.array(z.string()).max(100) }))
  return selectActiveAccounts(ctx, socialAccountIds)
})
