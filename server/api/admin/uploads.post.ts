import { handleUpload } from '../../core/uploads'
import { AVATAR_MAX_BYTES } from '../../../shared/utils/uploads'

export default defineEventHandler(async (event) => {
  await requireStaffContext(event)
  const kind = getQuery(event).kind === 'avatar' ? 'avatar' : 'image'
  return handleUpload('staff/', await readUploadedFile(event), { maxBytes: kind === 'avatar' ? AVATAR_MAX_BYTES : undefined })
})
