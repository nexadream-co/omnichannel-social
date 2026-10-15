import { expect, test } from '@playwright/test'
import { latestEmailText } from './helpers'

/**
 * The newcomer path (CLAUDE.md non-negotiable 1): a first-time creator reaches a scheduled post in
 * under five minutes without docs, then turns a product link into an Etalase.
 */
test.describe.serial('newcomer path', () => {
  const stamp = Date.now()
  const email = `e2e+${stamp}@socialz.test`
  const handle = `e2e${String(stamp).slice(-8)}`
  let page: import('@playwright/test').Page

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext({ ...test.info().project.use })).newPage()
  })

  test('register, verify email, connect a Facebook Page and schedule the first post in under 5 minutes', async () => {
    const started = Date.now()
    await page.goto('/app/auth/register')
    await page.getByLabel('Nama', { exact: true }).fill('Kreator E2E')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Kata sandi').fill('rahasia123')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Buat akun' }).click()
    await page.waitForURL(url => !url.pathname.endsWith('/register'))

    const text = await latestEmailText(email, 'Konfirmasi email')
    const verifyUrl = /https?:\/\/\S+\/app\/auth\/verify-email\?token=[\w.-]+/.exec(text)![0]
    await page.goto(new URL(verifyUrl).pathname + new URL(verifyUrl).search)
    await expect(page.getByText('Email kamu sudah terverifikasi')).toBeVisible()

    // Fake adapter: "authorize" returns straight to our callback; Facebook then asks which Pages to add.
    await page.goto('/api/app/channels/facebook/connect?return=/app/accounts')
    await page.waitForURL(/\/app\/accounts\/pick/)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Tambahkan' }).click()
    await page.waitForURL(url => url.pathname.endsWith('/app/accounts'))
    await expect(page.getByText('Toko Kreator Demo').first()).toBeVisible()

    await page.goto('/app/compose')
    await page.getByPlaceholder(/Tulis caption/).fill(`Postingan pertama E2E ${stamp}`)
    await page.getByRole('button', { name: 'Jadwalkan', exact: true }).click()
    await expect(page.getByText('Postingan dijadwalkan.').first()).toBeVisible()
    expect(Date.now() - started).toBeLessThan(5 * 60_000)

    await page.goto('/app/posts')
    await expect(page.getByText(`Postingan pertama E2E ${stamp}`)).toBeVisible()
  })

  test('paste a product link, open an Etalase, publish, and the public page shows it with no scripts', async () => {
    await page.goto('/app/links')
    await page.getByRole('button', { name: 'Tambah Produk' }).first().click()
    await page.getByPlaceholder(/s\.shopee/).fill('https://shopee.co.id/Produk-E2E-i.1.1')
    await page.getByRole('button', { name: 'Opsi lanjutan' }).click()
    await page.getByLabel('Nama produk').fill('Produk E2E Serbaguna')
    await page.getByRole('dialog').getByRole('button', { name: 'Tambah Produk' }).click()
    await expect(page.getByText('Produk E2E Serbaguna')).toBeVisible()

    await page.goto('/app/bio')
    await page.getByPlaceholder('namakamu').fill(handle)
    await expect(page.getByText('Nama tersedia')).toBeVisible()
    await page.getByRole('button', { name: 'Buat Etalase' }).click()
    await page.getByRole('button', { name: 'Terbitkan' }).click()
    await expect(page.getByText('Etalase sudah terbit.').first()).toBeVisible()

    const response = await page.goto(`/bio/${handle}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Produk E2E Serbaguna')).toBeVisible()
    expect(await page.locator('script').count()).toBe(0)
    expect(response?.headers()['content-security-policy']).toContain('script-src \'self\'')
  })
})
