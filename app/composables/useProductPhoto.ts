import type { LinkRow } from '~/pages/app/links/index.vue'

const PRODUCT_PHOTO_MAX_PX = 1080
const PRODUCT_PHOTO_MAX_BYTES = 600 * 1024

/** A product photo the creator adds by hand, for shops that do not share theirs (Tokopedia, removed pages). */
export function useProductPhoto() {
  const { t } = useI18n()

  /** Resized in the browser, then stored like any other small image. Throws a message fit for a toast. */
  async function upload(file: File): Promise<string> {
    let blob: Blob
    try {
      blob = await resizeImage(file, PRODUCT_PHOTO_MAX_PX, PRODUCT_PHOTO_MAX_BYTES)
    } catch {
      throw new Error(t('links.photoUnreadable'))
    }
    const body = new FormData()
    body.append('file', blob, 'product.jpg')
    return (await apiFetch<{ url: string }>('/api/app/uploads', { method: 'POST', body })).url
  }

  /** Upload and set it on a saved product: the composer, Etalase and auto-reply all show it. */
  async function setLinkPhoto(linkId: string, file: File): Promise<LinkRow> {
    const imageUrl = await upload(file)
    return apiFetch<LinkRow>(`/api/app/links/${linkId}`, { method: 'PATCH', body: { imageUrl } })
  }

  return { upload, setLinkPhoto }
}
