import { detectMerchant } from '#shared/utils/links'
import type { LinkRow } from '~/pages/app/links/index.vue'

/** Shared pieces for adding a product link from anywhere (composer, Etalase, links page). */
export function useAddProductLink() {
  const config = useRuntimeConfig()

  /** POST /api/app/links. Throws, so callers can hand plan errors to entitlements.handlePlanError. */
  function create(url: string, opts: { showInBio?: boolean, title?: string, priceIdr?: number } = {}) {
    return apiFetch<{ link: LinkRow, customIgnored: boolean }>('/api/app/links', {
      method: 'POST',
      body: { destinationUrl: url.trim(), title: opts.title || undefined, priceIdr: opts.priceIdr || undefined, showInBio: opts.showInBio }
    })
  }

  /** The autofill job fills title and photo within seconds: poll until both exist. */
  async function watchFill(id: string, onUpdate: (link: LinkRow) => void, tries = 6): Promise<void> {
    for (let i = 0; i < tries; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      const link = await apiFetch<LinkRow>(`/api/app/links/${id}`).catch(() => null)
      if (!link) return
      onUpdate(link)
      if (link.title && link.imageUrl) return
    }
  }

  /** Null when the browser refuses (no permission, no gesture, unsupported). */
  async function readClipboard(): Promise<string | null> {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return null
    }
  }

  /** Marketplace URLs found in a text, ignoring our own short links. */
  function findMarketplaceUrls(text: string): string[] {
    let ownHost = ''
    try {
      ownHost = new URL(config.public.shortUrl).hostname
    } catch {
      // no usable short domain configured
    }
    const urls = text.match(/https?:\/\/[^\s<>"']+/g) ?? []
    return urls.filter((url) => {
      if (detectMerchant(url) === 'other') return false
      try {
        return new URL(url).hostname !== ownHost
      } catch {
        return false
      }
    })
  }

  return { create, watchFill, readClipboard, findMarketplaceUrls }
}
