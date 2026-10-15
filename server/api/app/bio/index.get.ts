import { getMyBio } from '../../../core/bio/service'

export default defineEventHandler(async event => ({ page: await getMyBio(await requireWorkspaceContext(event)) }))
