import { linkPatchSchema, updateLink } from '../../../core/links/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateLink(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, linkPatchSchema))
})
