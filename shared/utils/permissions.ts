export const PERMISSIONS = {
  'dashboard': { read: 'dashboard.read' },
  'workspaces': { read: 'workspaces.read', write: 'workspaces.write' },
  'subscriptions': { read: 'subscriptions.read', write: 'subscriptions.write' },
  'plans': { read: 'plans.read', write: 'plans.write' },
  'payments': { read: 'payments.read', write: 'payments.write' },
  'staff': { read: 'staff.read', write: 'staff.write' },
  'roles': { read: 'roles.read', write: 'roles.write' },
  'permissions': { read: 'permissions.read', write: 'permissions.write' },
  'menus': { read: 'menus.read', write: 'menus.write' },
  'settings': { read: 'settings.read', write: 'settings.write' },
  'pages': { read: 'pages.read', write: 'pages.write' },
  'faq': { read: 'faq.read', write: 'faq.write' },
  'messages': { read: 'messages.read', write: 'messages.write' },
  'email-templates': { read: 'email-templates.read', write: 'email-templates.write' },
  'notification-templates': { read: 'notification-templates.read', write: 'notification-templates.write' },
  'reports': { read: 'reports.read' },
  'publishing': { read: 'publishing.read', write: 'publishing.write' },
  'channels': { read: 'channels.read', write: 'channels.write' },
  'links': { read: 'links.read', write: 'links.write' },
  'hashtags': { read: 'hashtags.read', write: 'hashtags.write' },
  'moments': { read: 'moments.read', write: 'moments.write' }
} as const

type Groups = typeof PERMISSIONS
export type PermissionGroup = keyof Groups
export type PermissionKey = { [G in PermissionGroup]: Groups[G][keyof Groups[G]] }[PermissionGroup]

export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS).flatMap(group => Object.values(group)) as PermissionKey[]

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  'dashboard': 'Dasbor',
  'workspaces': 'Ruang kerja kreator',
  'subscriptions': 'Langganan',
  'plans': 'Paket',
  'payments': 'Pembayaran',
  'staff': 'Staf',
  'roles': 'Peran',
  'permissions': 'Hak akses',
  'menus': 'Menu',
  'settings': 'Pengaturan',
  'pages': 'Halaman',
  'faq': 'FAQ',
  'messages': 'Pesan masuk',
  'email-templates': 'Templat email',
  'notification-templates': 'Templat notifikasi',
  'reports': 'Laporan',
  'publishing': 'Publikasi',
  'channels': 'Kanal & akun sosial',
  'links': 'Link & Etalase',
  'hashtags': 'Daftar tagar',
  'moments': 'Momen belanja'
}

export const PERMISSION_ACTION_LABELS = { read: 'Lihat', write: 'Ubah' } as const

export function permissionGroupOf(key: PermissionKey): PermissionGroup {
  return key.slice(0, key.lastIndexOf('.')) as PermissionGroup
}

export function describePermission(key: PermissionKey): string {
  const action = key.slice(key.lastIndexOf('.') + 1) as keyof typeof PERMISSION_ACTION_LABELS
  return `${PERMISSION_ACTION_LABELS[action]} ${PERMISSION_GROUP_LABELS[permissionGroupOf(key)].toLowerCase()}`
}

/** Seed role → permission sets (docs/blueprint/02 §4, 04 §1.2). */
export const ADMIN_EXCLUDED: PermissionKey[] = ['roles.write', 'permissions.write', 'menus.write']
export function adminPermissionKeys(): PermissionKey[] {
  return PERMISSION_KEYS.filter(key => !ADMIN_EXCLUDED.includes(key))
}
export function supportPermissionKeys(): PermissionKey[] {
  return [
    ...PERMISSION_KEYS.filter(key => key.endsWith('.read') && key !== 'reports.read'),
    'messages.write',
    'publishing.write'
  ]
}
