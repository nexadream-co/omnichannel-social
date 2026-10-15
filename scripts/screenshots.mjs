// Visual review helper: signs in, walks the given pages, and captures phone + desktop in light + dark.
// Usage: node scripts/screenshots.mjs <outDir> <creator|staff|public> <path> [path...]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [outDir, audience, ...paths] = process.argv.slice(2)
const BASE = process.env.SITE_URL || 'http://localhost:3000'
const LOGINS = {
  creator: { url: '/app/auth/login', email: process.env.QA_CREATOR_EMAIL || 'demo@socialz.local', password: process.env.QA_CREATOR_PASSWORD || 'demo12345', home: '**/app' },
  staff: { url: '/admin/auth/login', email: 'admin@socialz.local', password: 'admin12345', home: '**/admin/dashboard' }
}
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1366, height: 860 } }
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const problems = []
for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, colorScheme: scheme })
    const page = await context.newPage()
    page.on('pageerror', e => problems.push(`[${device}/${scheme}] pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) problems.push(`[${device}/${scheme}] console: ${m.text()}`)
    })
    await page.goto(BASE + '/')
    await page.evaluate(dark => localStorage.setItem('nuxt-color-mode', dark), scheme)
    const login = LOGINS[audience]
    if (login) {
      // A cold dev server reloads once while Vite optimises dependencies: retry the first navigation.
      await page.goto(BASE + login.url).catch(() => page.waitForTimeout(3000).then(() => page.goto(BASE + login.url)))
      await page.waitForSelector('input[type=email]', { timeout: 60_000 })
      await page.fill('input[type=email]', login.email)
      await page.fill('input[type=password]', login.password)
      await page.click('button[type=submit]')
      await page.waitForURL(u => !u.pathname.includes('/auth/'), { timeout: 15_000 })
    }
    for (const path of paths) {
      const response = await page.goto(BASE + path)
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await page.waitForTimeout(600)
      if (response && response.status() >= 400) problems.push(`[${device}/${scheme}] ${path} → HTTP ${response.status()}`)
      // Anything visible that extends past the viewport, unless an ancestor deliberately scrolls or clips it.
      const overflowing = await page.evaluate(() => {
        const clipped = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX
            if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
              const r = p.getBoundingClientRect()
              if (r.right <= window.innerWidth + 1) return true
            }
          }
          return false
        }
        return [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 2 && getComputedStyle(el).visibility !== 'hidden' && !clipped(el)
          })
          .slice(0, 3)
          .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`)
      })
      if (overflowing.length) problems.push(`[${device}/${scheme}] ${path} → overflow: ${overflowing.join(', ')}`)
      const name = `${audience}${path.replace(/[/?=&]+/g, '_')}-${device}-${scheme}.png`
      await page.screenshot({ path: `${outDir}/${name}`, fullPage: device === 'phone' })
    }
    await context.close()
  }
}
await browser.close()
console.log(problems.length ? problems.join('\n') : 'no problems detected')
