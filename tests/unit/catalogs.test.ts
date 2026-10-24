import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, formatLimit, normalizeFeatures, normalizeLimits, SEED_PLANS } from '../../shared/utils/plans'
import { abilitiesFor, canWorkspaceRole } from '../../shared/utils/workspace-abilities'
import { adminPermissionKeys, PERMISSION_KEYS, supportPermissionKeys } from '../../shared/utils/permissions'
import { flattenMenuTree } from '../../shared/utils/menus'
import { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES, escapeHtml, renderTemplateString } from '../../shared/utils/templates'
import { absolutizeHrefs } from '../../shared/utils/email-brand'
import { normalizeIndonesianPhone } from '../../shared/utils/phone'
import { SETTINGS_CATALOG } from '../../shared/utils/settings'

describe('plans', () => {
  it('fills keys a stored plan predates with the conservative default', () => {
    expect(normalizeLimits({ socialAccounts: 5, bogus: 9 })).toEqual({ ...DEFAULT_LIMITS, socialAccounts: 5 })
    expect(normalizeFeatures({ teamAccess: true, customSlug: 'yes' }).teamAccess).toBe(true)
    expect(normalizeFeatures({ customSlug: 'yes' }).customSlug).toBe(false)
  })
  it('formats unlimited and units', () => {
    expect(formatLimit('autoReplyRules', -1)).toBe('Tanpa batas')
    expect(formatLimit('scheduledPostsPerMonth', 1500)).toBe('1.500 postingan')
  })
  it('seeds Pro inactive and gives only Pro team access', () => {
    const pro = SEED_PLANS.find(p => p.slug === 'pro')!
    expect(pro.isActive).toBe(false)
    expect(SEED_PLANS.filter(p => p.features.teamAccess).map(p => p.slug)).toEqual(['pro'])
  })
})

describe('workspace RBAC', () => {
  it('keeps billing and social accounts owner-only', () => {
    expect(canWorkspaceRole('owner', 'billing.manage')).toBe(true)
    expect(canWorkspaceRole('editor', 'billing.manage')).toBe(false)
    expect(canWorkspaceRole('editor', 'accounts.manage')).toBe(false)
    expect(canWorkspaceRole('viewer', 'posts.write')).toBe(false)
    expect(canWorkspaceRole('system', 'billing.manage')).toBe(true)
    expect(abilitiesFor('viewer')).toEqual(['posts.read', 'analytics.read'])
  })
})

describe('platform RBAC seed sets', () => {
  it('admin cannot widen its own access; support cannot read revenue', () => {
    expect(adminPermissionKeys()).not.toContain('roles.write')
    expect(supportPermissionKeys()).not.toContain('reports.read')
    expect(supportPermissionKeys()).toContain('publishing.write')
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })
  it('every menu permission exists and depth is at most 3', () => {
    const rows = flattenMenuTree()
    for (const row of rows) if (row.permissionKey) expect(PERMISSION_KEYS).toContain(row.permissionKey)
    const depth = (id: string | null): number => id ? 1 + depth(rows.find(r => r.id === id)!.parentId) : 0
    for (const row of rows) expect(depth(row.id)).toBeLessThanOrEqual(3)
    expect(new Set(rows.map(r => r.slug)).size).toBe(rows.length)
  })
})

describe('templates', () => {
  it('renders tokens and optional blocks', () => {
    expect(renderTemplateString('Hai {{name}}{{#reason}}, alasan: {{reason}}{{/reason}}.', { name: 'Rina' })).toBe('Hai Rina.')
    expect(renderTemplateString('{{#reason}}({{reason}}){{/reason}}', { reason: 'x' })).toBe('(x)')
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
  })
  it('every token used in a template is declared (or common)', () => {
    const common = new Set(['appName', 'siteUrl', 'supportEmail', 'whatsappUrl'])
    for (const template of [...EMAIL_TEMPLATES, ...NOTIFICATION_TEMPLATES]) {
      const text = 'subject' in template ? template.subject + template.body : template.title + template.body + (template.actionUrl ?? '')
      const declared = new Set(template.variables.map(v => v.token))
      for (const [, token] of text.matchAll(/\{\{[#/]?(\w+)\}\}/g)) {
        expect(common.has(token!) || declared.has(token!), `${template.key}: {{${token}}}`).toBe(true)
      }
    }
  })
  it('absolutizes root-relative links only', () => {
    expect(absolutizeHrefs('<a href="/app/x">a</a><a href="//cdn/x">b</a><a href="mailto:a@b">c</a>', 'https://socialz.id/'))
      .toBe('<a href="https://socialz.id/app/x">a</a><a href="//cdn/x">b</a><a href="mailto:a@b">c</a>')
  })
})

describe('phone', () => {
  it('normalizes Indonesian mobiles to 62…', () => {
    expect(normalizeIndonesianPhone('0812-3456-7890')).toBe('6281234567890')
    expect(normalizeIndonesianPhone('+62 812 3456 7890')).toBe('6281234567890')
    expect(normalizeIndonesianPhone('021555')).toBeNull()
  })
})

describe('settings catalog', () => {
  it('has unique keys and select options for selects', () => {
    expect(new Set(SETTINGS_CATALOG.map(s => s.key)).size).toBe(SETTINGS_CATALOG.length)
    for (const def of SETTINGS_CATALOG.filter(s => s.type === 'select')) expect(def.options?.length).toBeGreaterThan(0)
  })
})

describe('phone display', () => {
  it('shows the local format people write', async () => {
    const { formatIndonesianPhone } = await import('../../shared/utils/phone')
    expect(formatIndonesianPhone('6281234567890')).toBe('0812-3456-7890')
    expect(formatIndonesianPhone(null)).toBe('')
  })
})
