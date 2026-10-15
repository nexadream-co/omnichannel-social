import { z } from 'zod'
import { calendarWindow } from '../../../core/publishing/service'

const schema = z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { from, to } = validatedQuery(event, schema)
  return calendarWindow(ctx, new Date(from), new Date(to))
})
