import { verifySubscription } from '../../core/autoreply/webhook'

/** Meta's subscription check: echo hub.challenge when hub.verify_token matches (ARCHITECTURE §9.1). */
export default defineEventHandler((event) => {
  const challenge = verifySubscription(getQuery(event))
  if (!challenge) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  setResponseHeader(event, 'content-type', 'text/plain')
  return challenge
})
