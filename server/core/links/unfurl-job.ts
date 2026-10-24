import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Database } from '../db/client'
import { links } from '../db/schema'
import { sniffImageType, stripJpegMetadata } from '../images'
import type { JobHandler } from '../jobs/types'
import { safeFetch, SafeFetchError } from '../net/safe-fetch'
import { unfurlHtml, type Unfurled } from '../net/unfurl'
import { storage } from '../services/storage'
import { titleFromUrl } from '../../../shared/utils/links'
import { IMAGE_EXTENSIONS } from '../../../shared/utils/uploads'

/**
 * links.unfurl ("paste-a-link magic"): fill title, price and image from the marketplace page, without ever
 * overwriting what the creator typed. The image is re-hosted (sniffed + EXIF stripped), never hot-linked.
 */
export const unfurlLinkJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const [row] = await db.select().from(links).where(eq(links.id, String(job.payload.linkId))).limit(1)
  if (!row) return
  // The paste preview may already have found the photo: then the page is read only for missing text.
  const imageHint = typeof job.payload.imageSourceUrl === 'string' ? job.payload.imageSourceUrl : null
  let details: Unfurled = { title: null, imageUrl: null, priceIdr: null }
  if (!row.title || !row.priceIdr || !(row.imageUrl || imageHint)) {
    try {
      const page = await safeFetch(row.destinationUrl, { maxBytes: 2 * 1024 * 1024 })
      details = unfurlHtml(new TextDecoder().decode(page.body), page.url)
    } catch (error) {
      // Unreachable pages are normal (bot walls, removed products): the name in the link is the fallback.
      ctx.log.info('links.unfurl_skipped', { linkId: row.id, reason: error instanceof SafeFetchError ? error.reason : 'error' })
    }
  }
  let imageUrl = row.imageUrl
  const imageSource = imageHint ?? details.imageUrl
  if (!imageUrl && imageSource) {
    try {
      const image = await safeFetch(imageSource, { maxBytes: 4 * 1024 * 1024, accept: 'image/*' })
      const type = sniffImageType(image.body)
      if (type) {
        const body = type === 'image/jpeg' ? stripJpegMetadata(image.body) : image.body
        const key = `w/${row.workspaceId}/img/${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSIONS[type]}`
        imageUrl = (await storage().upload({ key, body, contentType: type })).url
      }
    } catch (error) {
      ctx.log.info('links.unfurl_image_skipped', { linkId: row.id, error: (error as Error).message })
    }
  }
  await db.update(links).set({
    title: row.title ?? details.title ?? titleFromUrl(row.destinationUrl),
    priceIdr: row.priceIdr ?? details.priceIdr,
    imageUrl,
    updatedAt: new Date()
  }).where(eq(links.id, row.id))
}
