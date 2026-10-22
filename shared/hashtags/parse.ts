/**
 * Hashtag parsing shared by the composer, the server and the channel rules.
 * A tag starts at the beginning of the text or after whitespace and runs over letters, digits and
 * underscore, which is the part Instagram, Threads and Facebook turn into a link.
 */
export const HASHTAG_PATTERN = /(^|\s)#([\p{L}\p{N}_]+)/gu

/** What the writer meant as a tag: everything up to the next space, minus trailing sentence punctuation. */
const RAW_TAG_PATTERN = /(^|\s)#(\S+)/gu
const TRAILING_PUNCTUATION = /[.,!?;:)\]}"'”’]+$/u
const TAG_BODY = /^[\p{L}\p{N}_]+$/u

export function countTags(text: string): number {
  return text.match(HASHTAG_PATTERN)?.length ?? 0
}

/** Tags as the platforms link them, without the `#`, in order of appearance. */
export function extractTags(text: string): string[] {
  return [...text.matchAll(HASHTAG_PATTERN)].map(m => m[2]!)
}

/**
 * Tags as the writer typed them (`#skin-care` stays `skin-care`), so the quality check can say
 * "only `#skin` becomes a link". Trailing punctuation at the end of a sentence is dropped.
 */
export function extractRawTags(text: string): string[] {
  return [...text.matchAll(RAW_TAG_PATTERN)].map(m => m[2]!.replace(TRAILING_PUNCTUATION, '')).filter(Boolean)
}

/** `  #SkinCare ` → `skincare`. Comparison form only; the creator's own casing is kept in the caption. */
export function normalizeTag(input: string): string {
  return input.trim().replace(/^#+/, '').normalize('NFC').toLowerCase()
}

export function isValidTagBody(tag: string): boolean {
  return TAG_BODY.test(tag)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Tags that would be linked once written into a caption, deduplicated by their normal form. */
function toInsertable(tags: string[], existing: Set<string>): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const body = raw.trim().replace(/^#+/, '')
    const key = normalizeTag(body)
    if (!body || !isValidTagBody(body) || existing.has(key)) continue
    existing.add(key)
    out.push(body)
  }
  return out
}

/**
 * Adds tags at the end of the caption. If the last line is already a line of tags, they join it;
 * otherwise they start a new paragraph. Tags already in the caption are skipped.
 */
export function insertTags(caption: string, tags: string[]): string {
  const add = toInsertable(tags, new Set(extractTags(caption).map(normalizeTag)))
  if (!add.length) return caption
  const text = add.map(tag => `#${tag}`).join(' ')
  const trimmed = caption.replace(/\s+$/u, '')
  if (!trimmed) return text
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1)
  const tagLine = lastLine.trim() && lastLine.replace(HASHTAG_PATTERN, '').trim() === ''
  return tagLine ? `${trimmed} ${text}` : `${trimmed}\n\n${text}`
}

/** Removes every occurrence of a tag (any casing) and tidies the spaces and empty lines it leaves. */
export function removeTag(caption: string, tag: string): string {
  const body = escapeRegExp(normalizeTag(tag))
  const tagAt = `#${body}(?![\\p{L}\\p{N}_])`
  const pattern = new RegExp(`^${tagAt}[ \\t]*|[ \\t]+${tagAt}`, 'gimu')
  return caption.replace(pattern, '')
    .split('\n').map(line => line.replace(/[ \t]+$/u, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/u, '')
}

/**
 * Splits a joined tag into known words: `racunskincare` → `['racun', 'skincare']`.
 * Dynamic programming over the characters picks the split that covers the most letters with
 * vocabulary words of 2+ letters; letters no word covers are skipped.
 */
export function splitCompound(tag: string, vocabulary: ReadonlySet<string>): string[] {
  const text = normalizeTag(tag)
  const n = text.length
  const best: { covered: number, words: string[] }[] = [{ covered: 0, words: [] }]
  const maxWord = 24
  for (let i = 1; i <= n; i++) {
    let pick = { covered: best[i - 1]!.covered, words: best[i - 1]!.words }
    for (let j = Math.max(0, i - maxWord); j <= i - 2; j++) {
      const word = text.slice(j, i)
      if (!vocabulary.has(word)) continue
      const covered = best[j]!.covered + word.length
      if (covered > pick.covered || (covered === pick.covered && best[j]!.words.length + 1 < pick.words.length)) {
        pick = { covered, words: [...best[j]!.words, word] }
      }
    }
    best.push(pick)
  }
  return best[n]!.words
}

/** Keeps the first `max` distinct tags and removes the rest (Threads takes one tag per post). */
export function keepTags(caption: string, max: number): string {
  const kept = new Set<string>()
  let out = caption
  for (const tag of extractTags(caption)) {
    const key = normalizeTag(tag)
    if (kept.has(key)) continue
    if (kept.size < max) kept.add(key)
    else out = removeTag(out, key)
  }
  return out
}
