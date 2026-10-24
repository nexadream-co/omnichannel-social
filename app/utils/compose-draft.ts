export const DRAFT_MAX_AGE_MS = 7 * 86_400_000

export interface ComposeDraftOptions { captionOverride: string, format: string | null, firstComment: string, altText: string }

export interface ComposeDraft {
  caption: string
  selected: string[]
  mediaIds: string[]
  options: Record<string, ComposeDraftOptions>
  pillar: string
  slot: { date: string, time: string }
  savedAt: number
}

export const draftKey = (workspaceId: string) => `socialz:compose-draft:${workspaceId}`
/** Where the unfinished draft waits while a newer one is being written over it. */
export const draftBackupKey = (workspaceId: string) => `${draftKey(workspaceId)}:backup`

/** Only a blank composer autosaves; editing, duplicating or starting from an idea or media is someone else's content. */
export function isFreshComposer(source: { edit?: string | null, duplicate?: string | null, idea?: string | null, media?: string | null }): boolean {
  return !source.edit && !source.duplicate && !source.idea && !source.media
}

/** Nothing worth keeping: no words, no media, no per-platform text. */
export function isDraftEmpty(draft: Pick<ComposeDraft, 'caption' | 'mediaIds' | 'options'>): boolean {
  if (draft.caption.trim() || draft.mediaIds.length) return false
  return !Object.values(draft.options).some(o => o.captionOverride.trim() || o.firstComment.trim() || o.altText.trim())
}

export function isDraftExpired(savedAt: number, now = Date.now()): boolean {
  return !Number.isFinite(savedAt) || now - savedAt > DRAFT_MAX_AGE_MS || savedAt > now + 60_000
}

/** JSON for localStorage, or null when there is nothing to save. */
export function serialiseDraft(draft: Omit<ComposeDraft, 'savedAt'>, now = Date.now()): string | null {
  if (isDraftEmpty(draft)) return null
  return JSON.stringify({ ...draft, savedAt: now } satisfies ComposeDraft)
}

/** Tolerant parse: anything malformed, empty or older than 7 days is treated as no draft. */
export function parseDraft(raw: string | null, now = Date.now()): ComposeDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<ComposeDraft> | null
    if (!value || typeof value !== 'object' || typeof value.savedAt !== 'number') return null
    if (isDraftExpired(value.savedAt, now)) return null
    const draft: ComposeDraft = {
      caption: typeof value.caption === 'string' ? value.caption : '',
      selected: Array.isArray(value.selected) ? value.selected.filter((x): x is string => typeof x === 'string') : [],
      mediaIds: Array.isArray(value.mediaIds) ? value.mediaIds.filter((x): x is string => typeof x === 'string') : [],
      options: value.options && typeof value.options === 'object' ? value.options : {},
      pillar: typeof value.pillar === 'string' ? value.pillar : 'none',
      slot: value.slot && typeof value.slot.date === 'string' && typeof value.slot.time === 'string' ? { date: value.slot.date, time: value.slot.time } : { date: '', time: '' },
      savedAt: value.savedAt
    }
    return isDraftEmpty(draft) ? null : draft
  } catch {
    return null
  }
}
