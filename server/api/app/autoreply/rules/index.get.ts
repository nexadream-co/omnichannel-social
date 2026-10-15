import { listRules } from '../../../../core/autoreply/rules'

export default defineEventHandler(async event => ({ items: await listRules(await requireWorkspaceContext(event)) }))
