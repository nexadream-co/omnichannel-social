import type { PermissionKey } from './permissions'
import type { FeatureKey } from './plans'
import type { WorkspaceAbility } from './workspace-abilities'

export interface MenuNode {
  slug: string
  label: string
  path?: string
  icon?: string
  permissionKey?: PermissionKey
  children?: MenuNode[]
}

/** Default /admin sidebar (docs/blueprint/04 §1.3). Seeded into `menus`; the DB is the source of truth afterwards. */
export const MENU_TREE: MenuNode[] = [
  { slug: 'business', label: 'Bisnis', children: [
    { slug: 'workspaces', label: 'Ruang kerja', path: '/admin/workspaces', icon: 'i-lucide-briefcase', permissionKey: 'workspaces.read' },
    { slug: 'subscriptions', label: 'Langganan', path: '/admin/subscriptions', icon: 'i-lucide-repeat', permissionKey: 'subscriptions.read' },
    { slug: 'plans', label: 'Paket', path: '/admin/plans', icon: 'i-lucide-layers', permissionKey: 'plans.read' },
    { slug: 'payments', label: 'Pembayaran', path: '/admin/payments', icon: 'i-lucide-wallet', permissionKey: 'payments.read' },
    { slug: 'payment-gateways', label: 'Payment gateway', path: '/admin/payment-gateways', icon: 'i-lucide-plug', permissionKey: 'payments.write' },
    { slug: 'webhook-events', label: 'Payment callback', path: '/admin/webhook-events', icon: 'i-lucide-webhook', permissionKey: 'payments.read' }
  ] },
  { slug: 'operations', label: 'Operasional', children: [
    { slug: 'publish-failures', label: 'Postingan gagal', path: '/admin/publish-failures', icon: 'i-lucide-triangle-alert', permissionKey: 'publishing.read' },
    { slug: 'social-accounts', label: 'Kesehatan akun sosial', path: '/admin/social-accounts', icon: 'i-lucide-heart-pulse', permissionKey: 'channels.read' },
    { slug: 'links', label: 'Moderasi link & Etalase', path: '/admin/links', icon: 'i-lucide-shield-alert', permissionKey: 'links.read' },
    { slug: 'meta-webhooks', label: 'Meta webhook', path: '/admin/meta-webhooks', icon: 'i-lucide-radio', permissionKey: 'channels.read' }
  ] },
  { slug: 'content', label: 'Konten', children: [
    { slug: 'pages', label: 'Halaman', path: '/admin/pages', icon: 'i-lucide-file-text', permissionKey: 'pages.read' },
    { slug: 'faq', label: 'FAQ', path: '/admin/faq', icon: 'i-lucide-circle-help', permissionKey: 'faq.read' },
    { slug: 'messages', label: 'Pesan masuk', path: '/admin/messages', icon: 'i-lucide-inbox', permissionKey: 'messages.read' },
    { slug: 'email-templates', label: 'Templat email', path: '/admin/email-templates', icon: 'i-lucide-mail', permissionKey: 'email-templates.read' },
    { slug: 'notification-templates', label: 'Templat notifikasi', path: '/admin/notification-templates', icon: 'i-lucide-bell', permissionKey: 'notification-templates.read' },
    { slug: 'hashtags', label: 'Daftar tagar', path: '/admin/hashtags', icon: 'i-lucide-hash', permissionKey: 'hashtags.read' }
  ] },
  { slug: 'access', label: 'Akses', children: [
    { slug: 'users-group', label: 'Pengguna', icon: 'i-lucide-users', children: [
      { slug: 'staff', label: 'Staf', path: '/admin/staff', icon: 'i-lucide-user-cog', permissionKey: 'staff.read' },
      { slug: 'users', label: 'Pengguna kreator', path: '/admin/users', icon: 'i-lucide-user', permissionKey: 'workspaces.read' }
    ] },
    { slug: 'roles', label: 'Peran', path: '/admin/roles', icon: 'i-lucide-key-round', permissionKey: 'roles.read' },
    { slug: 'permissions', label: 'Hak akses', path: '/admin/permissions', icon: 'i-lucide-lock', permissionKey: 'permissions.read' },
    { slug: 'menus', label: 'Menu', path: '/admin/menus', icon: 'i-lucide-menu', permissionKey: 'menus.read' }
  ] },
  { slug: 'system', label: 'Sistem', children: [
    { slug: 'settings', label: 'Pengaturan', path: '/admin/settings', icon: 'i-lucide-settings', permissionKey: 'settings.read' },
    { slug: 'audit-logs', label: 'Log aktivitas', path: '/admin/audit-logs', icon: 'i-lucide-scroll-text', permissionKey: 'settings.read' },
    { slug: 'jobs', label: 'Antrean pekerjaan', path: '/admin/system/jobs', icon: 'i-lucide-list-checks', permissionKey: 'settings.read' }
  ] }
]

export interface FlatMenuRow {
  id: string
  parentId: string | null
  slug: string
  label: string
  path: string | null
  icon: string | null
  permissionKey: string | null
  order: number
}

export function menuId(slug: string): string {
  return `menu-${slug}`
}

export function flattenMenuTree(nodes: MenuNode[] = MENU_TREE, parentId: string | null = null): FlatMenuRow[] {
  return nodes.flatMap((node, index) => [
    {
      id: menuId(node.slug),
      parentId,
      slug: node.slug,
      label: node.label,
      path: node.path ?? null,
      icon: node.icon ?? null,
      permissionKey: node.permissionKey ?? null,
      order: index
    },
    ...flattenMenuTree(node.children ?? [], menuId(node.slug))
  ])
}

export interface CreatorNavItem {
  key: string
  labelKey: string
  to: string
  icon: string
  ability?: WorkspaceAbility
  feature?: FeatureKey
  /** Shown in the phone bottom nav (max 4 + "Lainnya"). */
  bottomNav?: boolean
}

/** Code-defined creator rail (docs/blueprint/13 §5). */
export const CREATOR_NAV: CreatorNavItem[] = [
  { key: 'home', labelKey: 'nav.home', to: '/app', icon: 'i-lucide-house', bottomNav: true },
  { key: 'compose', labelKey: 'nav.compose', to: '/app/compose', icon: 'i-lucide-square-pen', ability: 'posts.write' },
  { key: 'calendar', labelKey: 'nav.calendar', to: '/app/calendar', icon: 'i-lucide-calendar', ability: 'posts.read', bottomNav: true },
  { key: 'posts', labelKey: 'nav.posts', to: '/app/posts', icon: 'i-lucide-list', ability: 'posts.read' },
  { key: 'media', labelKey: 'nav.media', to: '/app/media', icon: 'i-lucide-images', ability: 'posts.read' },
  { key: 'links', labelKey: 'nav.links', to: '/app/links', icon: 'i-lucide-link', ability: 'links.manage', bottomNav: true },
  { key: 'bio', labelKey: 'nav.bio', to: '/app/bio', icon: 'i-lucide-store', ability: 'bio.manage', bottomNav: true },
  { key: 'autoReply', labelKey: 'nav.autoReply', to: '/app/auto-reply', icon: 'i-lucide-message-circle-reply', ability: 'autoreply.manage' },
  { key: 'analytics', labelKey: 'nav.analytics', to: '/app/analytics', icon: 'i-lucide-chart-column', ability: 'analytics.read' },
  { key: 'accounts', labelKey: 'nav.accounts', to: '/app/accounts', icon: 'i-lucide-at-sign', ability: 'accounts.manage' },
  { key: 'team', labelKey: 'nav.team', to: '/app/team', icon: 'i-lucide-users', ability: 'team.manage', feature: 'teamAccess' }
]
