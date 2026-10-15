import { getPublicBio } from '../../../core/bio/service'

/** Cached briefly at the edge (Cloudflare) so a follower spike never hits the database every tap. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60')
  return getPublicBio(getRouterParam(event, 'handle') ?? '')
})
