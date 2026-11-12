export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error' | 'warning'
}

/** A third answer next to confirm / cancel (e.g. "Simpan draf" when leaving the composer). */
export interface ChooseOptions extends ConfirmOptions {
  extraLabel: string
  extraIcon?: string
}

export type ConfirmChoice = 'confirm' | 'cancel' | 'extra'

interface ConfirmState extends ConfirmOptions {
  open: boolean
  extraLabel?: string
  extraIcon?: string
  resolve?: (value: ConfirmChoice) => void
}

/** One modal instance, mounted in each shell (<ConfirmDialog />). */
export function useConfirmDialog() {
  const state = useState<ConfirmState>('confirm-dialog', () => ({ open: false, title: '' }))

  function choose(options: ConfirmOptions & Partial<ChooseOptions>): Promise<ConfirmChoice> {
    return new Promise((resolve) => {
      state.value = { ...options, open: true, resolve }
    })
  }

  async function confirm(options: ConfirmOptions): Promise<boolean> {
    return (await choose(options)) === 'confirm'
  }

  function settle(value: ConfirmChoice) {
    state.value.resolve?.(value)
    state.value = { ...state.value, open: false, resolve: undefined }
  }

  return { state, confirm, choose, settle }
}
