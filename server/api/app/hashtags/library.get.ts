import { libraryForComposer } from '../../../core/hashtags/library'

export default defineEventHandler(async event => libraryForComposer(await requireWorkspaceContext(event)))
