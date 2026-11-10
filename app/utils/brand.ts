import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

/** Every brand logo the app draws: the social platforms, plus WhatsApp (Etalase and footer links). */
export type BrandKey = Platform | 'whatsapp'

/**
 * Each logo in its own colours, so a platform is recognised before its name is read.
 * Icons render as a CSS mask, so a background gradient paints the logo itself (Instagram).
 * The black logos (Threads, TikTok, X) turn white in dark mode to stay visible.
 */
const COLOR: Record<BrandKey, string> = {
  instagram: 'bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285aeb_90%)]',
  facebook: 'text-[#1877F2]',
  youtube: 'text-[#FF0000]',
  whatsapp: 'text-[#25D366]',
  threads: 'text-black dark:text-white',
  tiktok: 'text-black dark:text-white',
  x: 'text-black dark:text-white'
}

export const brandIcon = (key: BrandKey) => key === 'whatsapp' ? 'i-simple-icons-whatsapp' : PLATFORM_META[key].icon
export const brandIconClass = (key: BrandKey) => COLOR[key]
