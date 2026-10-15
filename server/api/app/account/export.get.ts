import { exportWorkspaceData } from '../../../core/account'

export default defineEventHandler(async (event) => {
  const { filename, data } = await exportWorkspaceData(await requireWorkspaceContext(event))
  setResponseHeader(event, 'content-disposition', `attachment; filename="${filename}"`)
  setResponseHeader(event, 'cache-control', 'no-store')
  return data
})
