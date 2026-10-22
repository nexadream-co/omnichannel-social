import type { EditSpec } from './edit-spec'

/** GET /api/app/media/:id and list items (server/core/media/service.ts toMediaView). */
export interface MediaView {
  id: string
  kind: 'image' | 'video'
  mime: string
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  url: string | null
  error: string | null
  createdAt: string
  posterUrl: string | null
  sourceMediaId: string | null
  editSpec: EditSpec | null
  coverMs: number | null
}

export interface MediaList {
  items: MediaView[]
  meta: { page: number, limit: number, total: number, pageCount: number }
  storage: { usedBytes: number, limitMb: number }
}
