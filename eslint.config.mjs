// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Serverless runtime contract (docs/blueprint/19 §2): no timers, process hooks or host SDKs in server code.
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'setInterval', message: 'No timers in server code. Enqueue a job with runAt instead (docs/blueprint/15).' }
      ],
      'no-restricted-properties': ['error',
        { object: 'process', property: 'on', message: 'No process hooks: invocations can be killed at any line (docs/blueprint/19 §2).' }
      ],
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'node:fs', message: 'The function filesystem is read-only (docs/blueprint/19 §2).' },
          { name: 'fs', message: 'The function filesystem is read-only (docs/blueprint/19 §2).' }
        ],
        patterns: [
          { group: ['@vercel/*', '@netlify/*', '@cloudflare/*', 'aws-lambda'], message: 'No host SDKs in app code (docs/blueprint/19 §2).' }
        ]
      }]
    }
  },
  {
    files: ['server/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'node:fs', message: 'The function filesystem is read-only (docs/blueprint/19 §2).' },
          { name: 'fs', message: 'The function filesystem is read-only (docs/blueprint/19 §2).' },
          { name: '#imports', message: 'server/core must not use Nitro auto-imports.' }
        ],
        patterns: [
          { group: ['@vercel/*', '@netlify/*', '@cloudflare/*', 'aws-lambda'], message: 'No host SDKs in app code (docs/blueprint/19 §2).' },
          { group: ['~/*', '#app', '#app/*', 'nitropack/*'], message: 'server/core uses explicit relative imports only.' }
        ]
      }]
    }
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' }
  }
)
