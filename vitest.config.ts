import { defineConfig } from 'vitest/config'

const TEST_DB = process.env.TEST_DATABASE_URL || 'postgresql://socialz:socialz@localhost:5432/socialz_test'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DB,
      DATABASE_URL_DIRECT: TEST_DB,
      SETTINGS_SECRET: 'test-settings-secret',
      BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
      CRON_SECRET: 'test-cron',
      INTERNAL_SIGNING_SECRET: 'test-internal',
      JOBS_FANOUT_MAX: '0',
      NUXT_PUBLIC_APP_ENV: 'test'
    }
  }
})
