import { z } from 'zod'
import { addCategory } from '../../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { name } = await readValidatedJson(event, z.object({ name: z.string().trim().min(1, 'Nama kategori wajib diisi.').max(40) }))
  return { page: await addCategory(ctx, name) }
})
