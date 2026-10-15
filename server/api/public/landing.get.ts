import { landingPayload } from '../../core/public-site'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  return landingPayload(requestContext(event).db)
})
