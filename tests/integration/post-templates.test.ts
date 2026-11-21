import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { plans, postTemplates, users } from '../../server/core/db/schema'
import { provisionWorkspace } from '../../server/core/registration'
import { createPostTemplate, deletePostTemplate, listPostTemplates, MAX_POST_TEMPLATES, postTemplateSchema, updatePostTemplate } from '../../server/core/templates/service'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let other: WorkspaceContext
const CAPTION = 'Sunscreen ringan, nggak lengket 🌞\n\nhttps://sclz.id/abc\n\n#sunscreen #skincare'

async function owner(email: string): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email })
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

beforeAll(async () => {
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('post_templates', 'audit_logs', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users')
  ws = await owner('rina@x.id')
  other = await owner('budi@x.id')
})
afterAll(async () => {
  await closeDb()
})

describe('post templates', () => {
  it('saves the caption as written, hashtags and product link included, newest first', async () => {
    const first = await createPostTemplate(ws, postTemplateSchema.parse({ name: '  Review  ', caption: CAPTION }))
    expect(first).toMatchObject({ name: 'Review', caption: CAPTION })
    await createPostTemplate(ws, postTemplateSchema.parse({ name: 'Promo', caption: 'Diskon!' }))
    expect((await listPostTemplates(ws)).items.map(i => i.name)).toEqual(['Promo', 'Review'])
    const renamed = await updatePostTemplate(ws, first.id, postTemplateSchema.partial().parse({ name: 'Review sunscreen' }))
    expect(renamed).toMatchObject({ name: 'Review sunscreen', caption: CAPTION })
    expect((await listPostTemplates(ws)).items[0]!.name).toBe('Review sunscreen')
  })

  it('belongs to its workspace and follows roles', async () => {
    const template = await createPostTemplate(ws, postTemplateSchema.parse({ name: 'A', caption: 'x' }))
    expect((await listPostTemplates(other)).items).toHaveLength(0)
    await expect(updatePostTemplate(other, template.id, { name: 'B' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deletePostTemplate(other, template.id)).rejects.toMatchObject({ statusCode: 404 })
    const viewer = { ...ws, role: 'viewer' as const }
    expect((await listPostTemplates(viewer)).items).toHaveLength(1)
    await expect(createPostTemplate(viewer, { name: 'C', caption: 'y' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(deletePostTemplate(viewer, template.id)).rejects.toMatchObject({ statusCode: 403 })
    await deletePostTemplate(ws, template.id)
    expect((await listPostTemplates(ws)).items).toHaveLength(0)
  })

  it('rejects empty or overlong input and stops at the sanity cap', async () => {
    expect(postTemplateSchema.safeParse({ name: '', caption: 'x' }).success).toBe(false)
    expect(postTemplateSchema.safeParse({ name: 'A', caption: '   ' }).success).toBe(false)
    expect(postTemplateSchema.safeParse({ name: 'A', caption: 'x'.repeat(2201) }).success).toBe(false)
    await getDb().insert(postTemplates).values(Array.from({ length: MAX_POST_TEMPLATES }, (_, i) => ({ workspaceId: ws.workspaceId, name: `T${i}`, caption: 'x' })))
    await expect(createPostTemplate(ws, { name: 'Satu lagi', caption: 'x' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(createPostTemplate(other, { name: 'Boleh', caption: 'x' })).resolves.toMatchObject({ name: 'Boleh' })
  })
})
