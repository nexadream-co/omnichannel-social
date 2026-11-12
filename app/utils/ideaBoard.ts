import { IDEA_STAGES, type ContentPillar, type IdeaStage } from '#shared/utils/planner'

/**
 * One place for the Ide board's stage colours (Nuxt UI semantic colours, so dark mode follows the theme). Class
 * strings are written out in full so Tailwind sees them. Labels live in i18n (`ideas.stage.<stage>`).
 */
export interface StageStyle {
  /** The coloured dot in the column header and on the phone chip. */
  dot: string
  /** The column while a card hovers over it: a light tint and a ring. */
  hover: string
  /** The dashed slot that opens where the card will land. */
  slot: string
  icon: string
}

export const STAGE_STYLE: Record<IdeaStage, StageStyle> = {
  raw: { dot: 'bg-inverted/45', hover: 'bg-inverted/5 ring-inverted/30', slot: 'border-inverted/40 bg-inverted/5', icon: 'i-lucide-lightbulb' },
  drafting: { dot: 'bg-info', hover: 'bg-info/10 ring-info/60', slot: 'border-info/60 bg-info/10', icon: 'i-lucide-pencil-line' },
  scheduled: { dot: 'bg-secondary', hover: 'bg-secondary/10 ring-secondary/60', slot: 'border-secondary/60 bg-secondary/10', icon: 'i-lucide-calendar-clock' },
  published: { dot: 'bg-success', hover: 'bg-success/10 ring-success/60', slot: 'border-success/60 bg-success/10', icon: 'i-lucide-circle-check' },
  failed: { dot: 'bg-error', hover: 'bg-error/10 ring-error/60', slot: 'border-error/60 bg-error/10', icon: 'i-lucide-circle-alert' }
}

/** A move that needs confirming looks amber whatever the column. */
export const CONFIRM_STYLE = { hover: 'bg-warning/10 ring-warning/70', slot: 'border-warning/70 bg-warning/10' }

/** The left edge of a card without a picture: the content type's colour. */
export const PILLAR_EDGE: Record<ContentPillar, string> = {
  promo: 'border-l-error',
  review: 'border-l-warning',
  edukasi: 'border-l-info',
  hiburan: 'border-l-success',
  cerita: 'border-l-secondary'
}

export const BOARD_STAGES = IDEA_STAGES
