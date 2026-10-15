import { defineConfig } from 'drizzle-kit'

// Migrations use the DIRECT database URL (CI only); runtime code uses the pooled URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/core/db/schema/index.ts',
  out: './server/core/db/migrations',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || 'postgresql://socialz:socialz@localhost:5432/socialz'
  }
})
