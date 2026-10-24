import { z } from 'zod'
import { detectMerchant, titleFromUrl } from '../../../shared/utils/links'
import { assertAbility, type WorkspaceContext } from '../context'
import { safeFetch } from '../net/safe-fetch'
import { unfurlHtml } from '../net/unfurl'
import { assertRateLimit } from '../rate-limit'

export const linkPreviewSchema = z.object({
  url: z.url({ protocol: /^https$/, error: 'Tempel link produk yang diawali https://' }).max(2000)
})

/**
 * POST /api/app/links/preview: what the pasted link will look like before it is saved (title, photo,
 * price). Nothing is stored; the photo URL is the shop's own and is re-hosted only when the link is saved.
 * An unreachable page is not an error: the title falls back to the name in the link (`titleGuessed`, which the
 * client does not save, so the autofill can still find the real one), the rest comes back empty.
 */
export async function previewLink(ctx: WorkspaceContext, input: z.infer<typeof linkPreviewSchema>) {
  assertAbility(ctx, 'links.manage')
  await assertRateLimit('link:preview', ctx.workspaceId, 300, 3_600_000, ctx.db)
  const base = { url: input.url, host: new URL(input.url).hostname.replace(/^www\./, ''), merchant: detectMerchant(input.url) }
  try {
    // Shorter than the autofill's 5 s: the creator is watching, and the autofill tries again after saving.
    const page = await safeFetch(input.url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 3_000 })
    const details = unfurlHtml(new TextDecoder().decode(page.body), page.url)
    return { ...base, ...details, title: details.title ?? titleFromUrl(input.url), titleGuessed: !details.title }
  } catch {
    return { ...base, title: titleFromUrl(input.url), titleGuessed: true, imageUrl: null, priceIdr: null }
  }
}
