import { expect, type Page } from '@playwright/test'

export const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

/** The newest email to `to` from Mailpit, as plain text. */
export async function latestEmailText(to: string, subjectIncludes: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then(r => r.json()) as { messages: { ID: string, Subject: string }[] }
    const hit = list.messages.find(m => m.Subject.includes(subjectIncludes))
    if (hit) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`).then(r => r.json()) as { Text: string }
      return message.Text
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`No email "${subjectIncludes}" for ${to}`)
}

export async function signIn(page: Page, path: '/app/auth/login' | '/admin/auth/login', email: string, password: string) {
  await page.goto(path)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/kata sandi/i).fill(password)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(url => !url.pathname.includes('/auth/'))
  await expect(page.locator('body')).not.toContainText('Ada yang tidak beres')
}
