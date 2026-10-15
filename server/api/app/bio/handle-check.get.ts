import { checkHandle } from '../../../core/bio/service'

export default defineEventHandler(async event => checkHandle(await requireWorkspaceContext(event), String(getQuery(event).handle ?? '')))
