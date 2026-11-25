import { loadDotEnv } from './_env'

loadDotEnv()

/**
 * `npm run content:sync [-- --only=templates|news]`: starter templates for workspaces that never got them, and a fresh
 * "Lagi rame" read. Needs DATABASE_URL only. Runs in every deploy build (db-deploy) and from the "Content sync" GitHub
 * workflow (by hand, and hourly as a backup for the tick). Exits non-zero when nothing could be read for news, so a
 * blocked feed shows up red in CI.
 */
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length)
if (only && only !== 'templates' && only !== 'news') throw new Error(`--only must be "templates" or "news", got "${only}"`)

const { closeDb } = await import('../server/core/db/client')
const { baseContext } = await import('../server/core/context')
const { syncContent } = await import('../server/core/content-sync')

try {
  const result = await syncContent(baseContext(), { templates: !only || only === 'templates', news: !only || only === 'news' })
  if (result.templates !== null) console.log(`Starter templates: added to ${result.templates} workspace(s).`)
  if (result.news) {
    for (const [region, count] of Object.entries(result.news)) console.log(`Lagi rame (${region}): ${count === null ? 'not read (feed failed, or the card is off in /admin)' : `${count} headline(s)`}`)
    if (Object.values(result.news).every(count => count === null)) process.exitCode = 1
  }
} finally {
  await closeDb()
}
