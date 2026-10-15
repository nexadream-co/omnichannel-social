import pg from 'pg'
import { loadDotEnv } from './_env'

loadDotEnv()

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || ''
if (process.env.NUXT_PUBLIC_APP_ENV === 'production' || /neon\.tech/.test(url)) {
  throw new Error('db:reset refuses to run against production or Neon. Use a local database.')
}

const client = new pg.Client({ connectionString: url })
await client.connect()
await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
await client.end()
console.log('Database reset.')
