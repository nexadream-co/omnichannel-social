import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL || 'demo@socialz.local'
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD || 'demo12345'

/** A 1600×1000 JPEG drawn in the browser, so the test needs no fixture file. */
async function landscapeJpeg(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    ;['#e11d48', '#16a34a', '#2563eb', '#f59e0b'].forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(i * 400, 0, 400, 1000)
    })
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    return btoa(binary)
  })
  return { name: 'produk.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') }
}

test('Galeri Media: upload a photo, crop it to 4:5 with text, keep the original', async ({ page }) => {
  // In dev, the Nuxt DevTools button sits over the editor's bottom tool bar.
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = '#nuxt-devtools-container{display:none!important}'
    document.head.append(style)
  }))
  await signIn(page, '/app/auth/login', DEMO_EMAIL, DEMO_PASSWORD)
  await page.goto('/app/media')
  await expect(page.getByRole('heading', { name: 'Galeri Media' })).toBeVisible()
  const before = await page.locator('.aspect-square').count()

  await page.locator('input[type=file]').setInputFiles(await landscapeJpeg(page))
  await expect(page.locator('.aspect-square')).toHaveCount(before + 1, { timeout: 60_000 })

  await page.getByRole('button', { name: 'Lainnya' }).first().click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByText('Edit foto').first()).toBeVisible()
  await page.getByRole('button', { name: 'Feed 4:5' }).click()
  await page.getByRole('button', { name: 'Teks' }).click()
  await page.getByRole('button', { name: 'Tambah teks' }).click()
  await page.locator('#media-editor-text').fill('Promo!')
  await page.getByRole('button', { name: 'Simpan' }).click()

  await expect(page.getByText('Hasil edit disimpan sebagai salinan baru.').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.aspect-square')).toHaveCount(before + 2)
  await expect(page.getByText('Diedit').first()).toBeVisible()
})
