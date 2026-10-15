import { getAllSettings } from '../../core/settings'

export default defineEventHandler(async () => {
  const settings = await getAllSettings()
  return {
    maintenanceMode: settings['app.maintenanceMode'] === 'true',
    maintenanceMessage: settings['app.maintenanceMessage'],
    publishingPaused: settings['channels.publishing.paused'] === 'true',
    publishingPausedMessage: settings['channels.publishing.pausedMessage'],
    autoReplyEnabled: settings['channels.autoReply.enabled'] !== 'false',
    registrationOpen: settings['app.registrationOpen'] !== 'false'
  }
})
