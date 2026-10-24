import { useDropZone, useEventListener } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

export interface FileDropOptions {
  /** Mime prefixes, e.g. ['image/', 'video/']. Empty or missing accepts everything. */
  accept?: string[]
  multiple?: boolean
  /** Also accept files pasted from the clipboard (text paste into inputs is left alone). */
  paste?: boolean
  onFiles: (files: File[]) => void
}

/** Drop (and optionally paste) files onto an element. */
export function useFileDrop(target: MaybeRefOrGetter<HTMLElement | null | undefined>, opts: FileDropOptions) {
  const accepts = (mime: string) => !opts.accept?.length || opts.accept.some(prefix => mime.startsWith(prefix))
  const pick = (files: File[] | FileList | null | undefined): File[] => {
    const accepted = Array.from(files ?? []).filter(file => accepts(file.type))
    return opts.multiple === false ? accepted.slice(0, 1) : accepted
  }

  const { isOverDropZone } = useDropZone(target, {
    dataTypes: types => !opts.accept?.length || types.length === 0 || types.some(accepts),
    multiple: opts.multiple !== false,
    preventDefaultForUnhandled: true,
    onDrop: (files) => {
      const accepted = pick(files)
      if (accepted.length) opts.onFiles(accepted)
    }
  })

  if (opts.paste && import.meta.client) {
    useEventListener(document, 'paste', (event: ClipboardEvent) => {
      const accepted = pick(event.clipboardData?.files)
      if (!accepted.length) return
      event.preventDefault()
      opts.onFiles(accepted)
    })
  }

  return { isOver: isOverDropZone }
}
