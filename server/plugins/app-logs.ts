import { flushLogs } from '../core/app-logs'

/** Stores the warn/error lines a request logged once its response is out. Error responses pass here too. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event) => {
    event.waitUntil(flushLogs())
  })
})
