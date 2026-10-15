import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a running app with ADAPTER_MODE=fake, Mailpit and the dev database
 * (docker compose -f docker/compose.dev.yml up -d; npm run db:migrate && npm run db:seed).
 *   npm run test:e2e                          # starts `npm run dev` if nothing listens on :3000
 *   E2E_BASE_URL=https://staging… npm run test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta'
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 180_000 }
})
