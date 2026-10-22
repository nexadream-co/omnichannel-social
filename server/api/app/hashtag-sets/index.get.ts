import { listHashtagSets } from '../../../core/hashtags/sets'

export default defineEventHandler(async event => listHashtagSets(await requireWorkspaceContext(event)))
