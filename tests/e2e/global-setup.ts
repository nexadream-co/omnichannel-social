import pg from 'pg'

/** Local runs only: clear rate-limit buckets so repeated sign-ups and logins aren't throttled. */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) return
  const url = process.env.DATABASE_URL || 'postgresql://socialz:socialz@localhost:5432/socialz'
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query('delete from rate_limit_buckets')
  // Fake platform accounts can belong to one workspace at a time: release the ones held by earlier E2E users.
  await client.query(`update social_accounts set status = 'revoked' where status <> 'revoked'
    and workspace_id in (select m.workspace_id from workspace_members m join users u on u.id = m.user_id where u.email like 'e2e+%@socialz.test')`)
  await client.end()
}
