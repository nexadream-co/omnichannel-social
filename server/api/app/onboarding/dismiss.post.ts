import { dismissOnboarding } from '../../../core/account'

export default defineEventHandler(async event => dismissOnboarding(await requireWorkspaceContext(event)))
