import { postTabCounts } from '../../../core/publishing/service'

export default defineEventHandler(async event => postTabCounts(await requireWorkspaceContext(event)))
