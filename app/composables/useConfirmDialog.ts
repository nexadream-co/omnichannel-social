export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error' | 'warning'
}

interface ConfirmState extends ConfirmOptions { open: boolean, resolve?: (value: boolean) => void }

/** One modal instance, mounted in each shell (<ConfirmDialog />). */
export function useConfirmDialog() {
  const state = useState<ConfirmState>('confirm-dialog', () => ({ open: false, title: '' }))

  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = { ...options, open: true, resolve }
    })
  }

  function settle(value: boolean) {
    state.value.resolve?.(value)
    state.value = { ...state.value, open: false, resolve: undefined }
  }

  return { state, confirm, settle }
}
