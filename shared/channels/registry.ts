import { facebook } from './facebook'
import { instagram } from './instagram'
import { threads } from './threads'
import type { ChannelCapabilities, Platform } from './types'

const soon = (platform: Platform): ChannelCapabilities => ({
  platform, formats: [], maxChars: 0, linkMode: 'plain', media: {}, requiresPublicMediaUrl: true,
  asyncContainer: false, supportsFirstComment: false, supportsCommentAutomation: false, available: false
})

export const CHANNELS: Record<Platform, ChannelCapabilities> = {
  instagram,
  threads,
  facebook,
  tiktok: soon('tiktok'),
  youtube: soon('youtube'),
  x: soon('x')
}

export const AVAILABLE_PLATFORMS = (Object.keys(CHANNELS) as Platform[]).filter(p => CHANNELS[p].available)

export const PLATFORM_META: Record<Platform, { name: string, icon: string, color: string }> = {
  instagram: { name: 'Instagram', icon: 'i-simple-icons-instagram', color: '#E1306C' },
  threads: { name: 'Threads', icon: 'i-simple-icons-threads', color: '#000000' },
  facebook: { name: 'Facebook', icon: 'i-simple-icons-facebook', color: '#1877F2' },
  tiktok: { name: 'TikTok', icon: 'i-simple-icons-tiktok', color: '#000000' },
  youtube: { name: 'YouTube', icon: 'i-simple-icons-youtube', color: '#FF0000' },
  x: { name: 'X', icon: 'i-simple-icons-x', color: '#000000' }
}

export function isPlatform(value: string): value is Platform {
  return value in CHANNELS
}
