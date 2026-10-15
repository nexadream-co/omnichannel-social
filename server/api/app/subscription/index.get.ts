import { getSubscriptionView } from '../../../core/subscriptions'

export default defineEventHandler(async event => getSubscriptionView(await requireWorkspaceContext(event)))
