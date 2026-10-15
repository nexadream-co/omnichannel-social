import { previewInvitation } from '../../../core/team'

export default defineEventHandler(event => previewInvitation(requestContext(event), getRouterParam(event, 'token') ?? ''))
