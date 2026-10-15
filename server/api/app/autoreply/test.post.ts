import { z } from 'zod'
import { testRule } from '../../../core/autoreply/rules'

const schema = z.object({
  comment: z.string().trim().min(1, 'Tulis contoh komentar.').max(500),
  keywords: z.array(z.string().max(40)).max(10).default([]),
  matchMode: z.enum(['exact', 'contains']).default('contains'),
  dmMessage: z.string().max(1000).default(''),
  linkId: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return testRule(ctx, await readValidatedJson(event, schema))
})
