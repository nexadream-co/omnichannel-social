import { expect, test } from '@playwright/test'

test('landing: sections, pricing toggle and the contact form', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  for (const id of ['fitur', 'cara-kerja', 'harga', 'kontak']) await expect(page.locator(`#${id}`)).toBeAttached()
  await page.locator('#harga').scrollIntoViewIfNeeded()
  // The page is server-rendered: the toggle only responds once hydrated, so retry the click until it does.
  await expect(async () => {
    await page.getByRole('tab', { name: /Tahunan/ }).click()
    await expect(page.locator('#harga').getByText('/tahun').first()).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })

  await page.locator('#kontak').scrollIntoViewIfNeeded()
  await page.getByLabel('Nama').fill('Pengunjung E2E')
  await page.getByLabel('Email').fill('pengunjung@socialz.test')
  await page.getByLabel('Pesan').fill('Halo, saya ingin bertanya tentang paket tahunan.')
  await page.getByRole('button', { name: 'Kirim pesan' }).click()
  await expect(page.getByText('Pesan terkirim').first()).toBeVisible()
})

test('legal pages, robots and sitemap are served', async ({ page, request }) => {
  for (const path of ['/privacy', '/terms', '/hapus-akun', '/harga']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
  }
  expect((await request.get('/robots.txt')).status()).toBe(200)
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<urlset')
})
