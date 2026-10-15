import { inviteMember, inviteSchema } from '../../../../core/team'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return inviteMember(ctx, await readValidatedJson(event, inviteSchema))
})
