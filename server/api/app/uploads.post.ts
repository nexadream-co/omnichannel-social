import { handleUpload } from '../../core/uploads'
import { AVATAR_MAX_BYTES } from '../../../shared/utils/uploads'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const kind = getQuery(event).kind === 'avatar' ? 'avatar' : 'image'
  return handleUpload(`w/${ctx.workspaceId}/img/`, await readUploadedFile(event), { maxBytes: kind === 'avatar' ? AVATAR_MAX_BYTES : undefined })
})
