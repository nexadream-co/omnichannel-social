/** The one conversion module for platform money (docs/blueprint/16 §8). Never floats over the wire. */
export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

/** Whole rupiah for gateway amounts. */
export function toRupiah(value: number): number {
  return Math.round(value)
}

/** Server-side IDR formatting for emails (replaces the non-breaking space Intl emits). */
export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value).replace(/\u00A0/g, ' ')
}
