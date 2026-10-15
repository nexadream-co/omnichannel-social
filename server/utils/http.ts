import type { H3Event } from 'h3'

export interface ListQuery {
  page: number
  limit: number
  offset: number
  search: string
  dateFrom: Date | null
  dateTo: Date | null
  sort: string | null
  order: 'asc' | 'desc'
  isActive: boolean | null
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Shared by every list endpoint (docs/blueprint/12 §5). */
export function parseListQuery(event: H3Event, sortable: string[] = []): ListQuery {
  const query = getQuery(event)
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 20)))
  const sort = typeof query.sort === 'string' && sortable.includes(query.sort) ? query.sort : null
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof query.search === 'string' ? query.search.trim() : '',
    dateFrom: toDate(query.dateFrom),
    dateTo: toDate(query.dateTo),
    sort,
    order: query.order === 'asc' ? 'asc' : 'desc',
    isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : null
  }
}

export function listMeta(page: number, limit: number, total: number) {
  return { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) }
}
