import { z } from 'zod'
import { listWorkspacePayments } from '../../../../core/subscriptions'

const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) })

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listWorkspacePayments(ctx, validatedQuery(event, query))
})
