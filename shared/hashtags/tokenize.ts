import { HASHTAG_PATTERN } from './parse'

/** Bahasa (including chat spelling) and English words that say nothing about the content. */
const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'untuk', 'utk', 'dengan', 'dgn', 'aku', 'saya', 'gue', 'gw', 'kamu', 'kalian', 'kita', 'kami',
  'ada', 'juga', 'sudah', 'udah', 'udh', 'banget', 'bgt', 'aja', 'saja', 'buat', 'bisa', 'lagi', 'lg', 'nih', 'deh', 'sih', 'dong', 'kok', 'ya',
  'yg', 'atau', 'tapi', 'tp', 'karena', 'krn', 'jadi', 'jd', 'kalau', 'kalo', 'klo', 'pada', 'dalam', 'akan', 'tidak', 'tak', 'gak', 'nggak',
  'ngga', 'ga', 'enggak', 'sangat', 'lebih', 'paling', 'semua', 'cuma', 'hanya', 'masih', 'mau', 'pengen', 'ingin', 'biar', 'agar', 'supaya',
  'sama', 'kayak', 'kaya', 'seperti', 'gimana', 'bagaimana', 'apa', 'siapa', 'kapan', 'mana', 'kenapa', 'sini', 'situ', 'sana', 'nya', 'pun',
  'lah', 'kah', 'loh', 'lho', 'wkwk', 'hehe', 'haha', 'guys', 'gaes', 'kak', 'kakak', 'teman', 'temen', 'semuanya', 'hari', 'sekarang',
  'link', 'klik', 'cek', 'check', 'bio', 'komen', 'comment', 'ketik', 'dm', 'follow', 'save', 'share', 'keranjang', 'kuning', 'checkout', 'co',
  'the', 'and', 'for', 'with', 'this', 'that', 'you', 'your', 'my', 'is', 'are', 'to', 'of', 'in', 'on', 'an', 'it', 'at', 'be', 'so', 'just'
])

/** Suffixes trimmed when at least 4 letters remain: `bajunya` → `baju`, `rekomendasikan` → `rekomendasi`. */
const SUFFIXES = ['nya', 'lah', 'kah', 'kan']

const URL_PATTERN = /https?:\/\/\S+|\b[\w-]+\.(?:id|com|co|ly|ee|me|link)\/\S*/giu
const MENTION_PATTERN = /(^|\s)@[\w.]+/gu
const WORD_PATTERN = /[\p{L}\p{N}]+/gu

function stem(word: string): string | null {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length)
  }
  return null
}

/**
 * Content words of a caption, lowercased, with links, mentions and the caption's own tags left
 * out (a tag must not count as evidence for itself). Stemmed forms are added next to the originals.
 */
export function contentWords(text: string): Set<string> {
  const clean = text.normalize('NFC').toLowerCase()
    .replace(URL_PATTERN, ' ')
    .replace(MENTION_PATTERN, ' ')
    .replace(HASHTAG_PATTERN, ' ')
  const words = new Set<string>()
  for (const [word] of clean.matchAll(WORD_PATTERN)) {
    if (word.length < 2 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue
    words.add(word)
    const stemmed = stem(word)
    if (stemmed && !STOPWORDS.has(stemmed)) words.add(stemmed)
  }
  return words
}
