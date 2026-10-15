import { z } from 'zod'
import { reorderItems } from '../../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { itemIds } = await readValidatedJson(event, z.object({ itemIds: z.array(z.string()).max(500) }))
  return { page: await reorderItems(ctx, itemIds) }
})
