import { z } from 'zod'
import { setBioPublished } from '../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { published } = await readValidatedJson(event, z.object({ published: z.boolean() }))
  return { page: await setBioPublished(ctx, published) }
})
