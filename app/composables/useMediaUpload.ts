import type { EditSpec } from '#shared/media/edit-spec'
import type { MediaView } from '#shared/media/types'

/** PUT straight to storage with real progress (XHR: fetch has no upload progress). */
function put(url: string, headers: Record<string, string>, body: Blob, contentType: string, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.setRequestHeader('content-type', contentType)
    xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(body)
  })
}

/**
 * Media uploads (docs/blueprint/16 §1.1): presign → PUT to storage → complete → poll until ready.
 * Shared by the composer, Galeri Media and the editor, whose copies upload the same way.
 */
export function useMediaUpload() {
  /** Returns the new media id once the file is uploaded; processing continues on the server. */
  async function upload(file: Blob, options: { filename: string, mime?: string, sourceMediaId?: string, editSpec?: EditSpec, onUploaded?: (mediaId: string) => void, onProgress?: (p: number) => void }) {
    const mime = options.mime || file.type || (options.filename.toLowerCase().endsWith('.heic') ? 'image/heic' : '')
    const { mediaId, uploadUrl, uploadHeaders } = await apiFetch<{ mediaId: string, uploadUrl: string, uploadHeaders?: Record<string, string> }>('/api/app/media/presign', {
      method: 'POST',
      body: { filename: options.filename, mime, bytes: file.size, sourceMediaId: options.sourceMediaId, editSpec: options.editSpec }
    })
    options.onUploaded?.(mediaId)
    await put(uploadUrl, uploadHeaders ?? {}, file, mime, options.onProgress)
    await apiFetch(`/api/app/media/${mediaId}/complete`, { method: 'POST' })
    return mediaId
  }

  /** A video edit is rendered on the server; the browser only sends the recipe and the drawn overlay. */
  async function renderVideoEdit(sourceMediaId: string, spec: EditSpec, overlay: Blob | null) {
    const { mediaId, overlayUploadUrl, overlayUploadHeaders } = await apiFetch<{ mediaId: string, overlayUploadUrl: string | null, overlayUploadHeaders?: Record<string, string> }>(`/api/app/media/${sourceMediaId}/edits`, {
      method: 'POST',
      body: { spec, hasOverlay: Boolean(overlay) }
    })
    if (overlay && overlayUploadUrl) {
      await put(overlayUploadUrl, overlayUploadHeaders ?? {}, overlay, 'image/png')
      await apiFetch(`/api/app/media/${mediaId}/complete`, { method: 'POST' })
    }
    return mediaId
  }

  /** Polls until the server has finished (1 s at first, then every 3 s; videos can take minutes). */
  async function waitReady(mediaId: string) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const media = await apiFetch<MediaView>(`/api/app/media/${mediaId}`)
      if (media.status === 'ready' || media.status === 'failed') return media
      await new Promise(resolve => setTimeout(resolve, attempt < 10 ? 1000 : 3000))
    }
    return null
  }

  return { upload, renderVideoEdit, waitReady }
}
