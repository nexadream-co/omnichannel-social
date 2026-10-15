import QRCode from 'qrcode'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** QR code PNG for printed promos and stories (docs/SCREENS.md #22, #23). */
export async function downloadQr(text: string, filename: string): Promise<void> {
  const url = await QRCode.toDataURL(text, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.png`
  a.click()
}
