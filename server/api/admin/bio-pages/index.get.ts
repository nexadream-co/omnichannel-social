import { z } from 'zod'
import { listBioPagesAdmin } from '../../../core/admin/operations'

const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(100).default('') })

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'links.read')
  return listBioPagesAdmin(ctx, validatedQuery(event, query))
})
