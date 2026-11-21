import { listPostTemplates } from '../../../core/templates/service'

export default defineEventHandler(async event => listPostTemplates(await requireWorkspaceContext(event)))
