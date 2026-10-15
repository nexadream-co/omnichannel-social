import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@socialz.local'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin12345'

test('back-office: dashboard, workspaces and every operations screen open', async ({ page }) => {
  await signIn(page, '/admin/auth/login', ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(page.getByText('Kesehatan platform')).toBeVisible()
  for (const path of ['/admin/workspaces', '/admin/payments', '/admin/publish-failures', '/admin/social-accounts', '/admin/links', '/admin/meta-webhooks', '/admin/audit-logs', '/admin/system/jobs']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Ada yang tidak beres')
  }
})
