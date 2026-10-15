import { loadDotEnv } from './_env'

loadDotEnv()

/** Calls the tick like a host cron would (every 15 s in dev). Production: one cron entry per minute (docs/blueprint/19 §3). */
const url = `${process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/internal/tick`
const secret = process.env.CRON_SECRET || ''
const everyMs = Number(process.env.DEV_TICK_MS || 15_000)

async function tick() {
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
    const body = await response.json().catch(() => ({}))
    console.log(new Date().toISOString(), response.status, JSON.stringify(body))
  } catch (error) {
    console.log(new Date().toISOString(), 'tick failed:', (error as Error).message)
  }
}

console.log(`Ticking ${url} every ${everyMs / 1000}s (Ctrl+C to stop)`)
for (;;) {
  await tick()
  await new Promise(resolve => setTimeout(resolve, everyMs))
}
