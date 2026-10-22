import type { Aspect } from '#shared/media/edit-spec'

export interface MediaEditorRequest {
  mediaId: string
  /** Pre-selects a crop shape (e.g. 4:5 from the composer's "Instagram akan memotong" hint) and opens Potong. */
  aspect?: Aspect
}

interface MediaEditorState { open: boolean, request: MediaEditorRequest | null, resolve?: (mediaId: string | null) => void }

/**
 * One editor instance, mounted in CreatorShell (<MediaEditorHost />). `edit()` resolves with the id of the new
 * copy (uploaded, still processing) or null when the creator cancels.
 */
export function useMediaEditor() {
  const state = useState<MediaEditorState>('media-editor', () => ({ open: false, request: null }))

  function edit(request: MediaEditorRequest): Promise<string | null> {
    state.value.resolve?.(null)
    return new Promise((resolve) => {
      state.value = { open: true, request, resolve }
    })
  }

  function settle(mediaId: string | null) {
    state.value.resolve?.(mediaId)
    state.value = { open: false, request: null }
  }

  return { state, edit, settle }
}
