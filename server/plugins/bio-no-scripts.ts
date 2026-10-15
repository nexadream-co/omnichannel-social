/**
 * The public Etalase ships zero JavaScript (docs/blueprint/14 §4). routeRules noScripts drops Nuxt's own bundles;
 * this strips the inline scripts modules still inject (colour mode, speculation rules) so the strict CSP holds.
 */
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    if (!event.path.startsWith('/bio/')) return
    for (const key of ['head', 'bodyPrepend', 'bodyAppend'] as const) html[key] = html[key].map(chunk => chunk.replace(SCRIPT, ''))
  })
})
