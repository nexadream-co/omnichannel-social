export type WorkspaceRoleSlug = 'owner' | 'editor' | 'viewer'

export const WORKSPACE_ABILITIES = [
  'billing.manage',
  'settings.manage',
  'account.manage',
  'team.manage',
  'activity.read',
  'accounts.manage',
  'posts.read',
  'posts.write',
  'media.manage',
  'links.manage',
  'bio.manage',
  'autoreply.manage',
  'analytics.read'
] as const
export type WorkspaceAbility = (typeof WORKSPACE_ABILITIES)[number]

const ABILITIES: Record<WorkspaceRoleSlug, readonly WorkspaceAbility[]> = {
  owner: WORKSPACE_ABILITIES,
  editor: ['posts.read', 'posts.write', 'media.manage', 'links.manage', 'bio.manage', 'autoreply.manage', 'analytics.read'],
  viewer: ['posts.read', 'analytics.read']
}

/** 'system' (job context) passes every ability check. Named canWorkspaceRole so it never clashes with entitlements' can(). */
export function canWorkspaceRole(role: WorkspaceRoleSlug | 'system', ability: WorkspaceAbility): boolean {
  if (role === 'system') return true
  return ABILITIES[role]?.includes(ability) ?? false
}

export function abilitiesFor(role: WorkspaceRoleSlug | 'system'): WorkspaceAbility[] {
  return role === 'system' ? [...WORKSPACE_ABILITIES] : [...ABILITIES[role]]
}

export const WORKSPACE_ROLE_PRESETS: Record<WorkspaceRoleSlug, { labelKey: string, summaryKey: string, icon: string }> = {
  owner: { labelKey: 'role.owner.label', summaryKey: 'role.owner.summary', icon: 'i-lucide-crown' },
  editor: { labelKey: 'role.editor.label', summaryKey: 'role.editor.summary', icon: 'i-lucide-pen-line' },
  viewer: { labelKey: 'role.viewer.label', summaryKey: 'role.viewer.summary', icon: 'i-lucide-eye' }
}

export const ASSIGNABLE_WORKSPACE_ROLES: WorkspaceRoleSlug[] = ['editor', 'viewer']
