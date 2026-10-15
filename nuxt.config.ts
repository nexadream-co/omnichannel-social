import pkg from './package.json' with { type: 'json' }

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY'
}

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxtjs/i18n'],
  ssr: true,
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  colorMode: { preference: 'light', fallback: 'light' },
  runtimeConfig: {
    // Server-only values are read from process.env by server/core/env.ts (zod-validated).
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      shortUrl: process.env.NUXT_PUBLIC_SHORT_URL || 'http://localhost:3000',
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || 'development',
      appVersion: pkg.version,
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID)
    }
  },
  routeRules: {
    '/**': { headers: securityHeaders },
    '/app/**': { ssr: false },
    '/en/app/**': { ssr: false },
    '/admin/**': { ssr: false },
    '/api/**': { cache: false }
  },
  compatibilityDate: '2026-10-01',
  nitro: {
    // The host is chosen at build time with NITRO_PRESET (docs/blueprint/19 §4).
    experimental: { asyncContext: false }
  },
  eslint: {
    config: {
      stylistic: { commaDangle: 'never', braceStyle: '1tbs' }
    }
  },
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'id',
    locales: [
      { code: 'id', language: 'id-ID', name: 'Bahasa Indonesia', file: 'id.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' }
    ],
    detectBrowserLanguage: false
  }
})
