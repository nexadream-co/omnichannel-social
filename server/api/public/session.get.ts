/**
 * Lets public pages swap "Masuk / Coba gratis" for a way back into the app. Always 200, so signed-out
 * visitors get no error in their console; never cached, since the answer depends on the cookie.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'private, no-store')
  return { signedIn: Boolean(await tryGetCreatorSession(event)) }
})
