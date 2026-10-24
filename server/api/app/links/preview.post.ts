import { linkPreviewSchema, previewLink } from '../../../core/links/preview'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return previewLink(ctx, await readValidatedJson(event, linkPreviewSchema))
})
