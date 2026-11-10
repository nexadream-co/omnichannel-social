/**
 * Return address registered with the Nexadream Payment Hub (finish, error and pending redirects).
 * Billing reads the payment's real status by `order_id` / `reference`, so the query only carries the order id
 * along; any `status` the hub appends is display-only and never trusted (docs/blueprint/08 §5.6).
 */
export default defineEventHandler((event) => {
  const query = getQuery(event)
  const params = new URLSearchParams()
  for (const key of ['order_id', 'reference', 'status']) {
    const value = query[key]
    if (typeof value === 'string' && value) params.set(key, value)
  }
  const search = params.toString()
  return sendRedirect(event, `/app/billing${search ? `?${search}` : ''}`, 302)
})
