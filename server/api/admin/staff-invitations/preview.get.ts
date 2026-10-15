import { previewStaffInvitation } from '../../../core/admin/people'

/** Public: the accept page reads who is invited before asking for a password. */
export default defineEventHandler(async event => previewStaffInvitation(requestContext(event), String(getQuery(event).token ?? '')))
