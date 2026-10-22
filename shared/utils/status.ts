type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
export interface StatusMeta { labelKey: string, color: BadgeColor }

export const SUBSCRIPTION_STATUS_META: Record<string, StatusMeta> = {
  trialing: { labelKey: 'status.subscription.trialing', color: 'info' },
  active: { labelKey: 'status.subscription.active', color: 'success' },
  past_due: { labelKey: 'status.subscription.past_due', color: 'warning' },
  cancelled: { labelKey: 'status.subscription.cancelled', color: 'neutral' },
  downgraded: { labelKey: 'status.subscription.downgraded', color: 'neutral' },
  suspended: { labelKey: 'status.subscription.suspended', color: 'error' }
}

export const WORKSPACE_STATUS_META: Record<string, StatusMeta> = {
  active: { labelKey: 'status.workspace.active', color: 'success' },
  suspended: { labelKey: 'status.workspace.suspended', color: 'error' },
  deleted: { labelKey: 'status.workspace.deleted', color: 'neutral' }
}

export const WORKSPACE_ROLE_META: Record<string, StatusMeta> = {
  owner: { labelKey: 'role.owner.label', color: 'primary' },
  editor: { labelKey: 'role.editor.label', color: 'info' },
  viewer: { labelKey: 'role.viewer.label', color: 'neutral' }
}

export const JOB_STATUS_META: Record<string, StatusMeta> = {
  queued: { labelKey: 'status.job.queued', color: 'info' },
  running: { labelKey: 'status.job.running', color: 'warning' },
  done: { labelKey: 'status.job.done', color: 'success' },
  dead: { labelKey: 'status.job.dead', color: 'error' },
  cancelled: { labelKey: 'status.job.cancelled', color: 'neutral' }
}

export const SOCIAL_ACCOUNT_STATUS_META: Record<string, StatusMeta> = {
  active: { labelKey: 'accounts.status.active', color: 'success' },
  needs_reauth: { labelKey: 'accounts.status.needs_reauth', color: 'warning' },
  disabled: { labelKey: 'accounts.status.disabled', color: 'neutral' },
  revoked: { labelKey: 'accounts.status.revoked', color: 'neutral' }
}

export const POST_STATUS_META: Record<string, StatusMeta> = {
  draft: { labelKey: 'status.post.draft', color: 'neutral' },
  scheduled: { labelKey: 'status.post.scheduled', color: 'info' },
  publishing: { labelKey: 'status.post.publishing', color: 'warning' },
  published: { labelKey: 'status.post.published', color: 'success' },
  partial: { labelKey: 'status.post.partial', color: 'warning' },
  failed: { labelKey: 'status.post.failed', color: 'error' },
  cancelled: { labelKey: 'status.post.cancelled', color: 'neutral' }
}

/** Creators see five words: Draf, Terjadwal, Diproses, Terbit, Gagal (docs/SCREENS.md §I). */
export const POST_TARGET_STATUS_META: Record<string, StatusMeta> = {
  draft: { labelKey: 'status.target.draft', color: 'neutral' },
  scheduled: { labelKey: 'status.target.scheduled', color: 'info' },
  preparing: { labelKey: 'status.target.processing', color: 'warning' },
  processing: { labelKey: 'status.target.processing', color: 'warning' },
  publishing: { labelKey: 'status.target.processing', color: 'warning' },
  publish_unknown: { labelKey: 'status.target.processing', color: 'warning' },
  retrying: { labelKey: 'status.target.processing', color: 'warning' },
  quota_deferred: { labelKey: 'status.target.deferred', color: 'info' },
  needs_reauth: { labelKey: 'status.target.needsReauth', color: 'warning' },
  published: { labelKey: 'status.target.published', color: 'success' },
  failed: { labelKey: 'status.target.failed', color: 'error' },
  cancelled: { labelKey: 'status.target.cancelled', color: 'neutral' }
}

/** What a sync noticed on the platform after publishing (post_target_change_kind). Labels take `{platform}`. */
export const POST_CHANGE_LABELS: Record<string, string> = {
  caption_changed: 'posts.change.caption_changed',
  removed: 'posts.change.removed',
  restored: 'posts.change.restored'
}

/**
 * Why a target failed, in plain words with the fix (ARCHITECTURE §1.1 rule 6). Keys are stable codes stored
 * in post_targets.last_error_code; Meta's raw text never reaches a creator.
 */
export const PUBLISH_ERROR_LABELS: Record<string, string> = {
  auth: 'publishError.auth',
  rate_limit: 'publishError.rateLimit',
  quota: 'publishError.quota',
  validation: 'publishError.validation',
  permanent: 'publishError.permanent',
  transient: 'publishError.transient',
  not_found_after_publish: 'publishError.notFound',
  container_timeout: 'publishError.containerTimeout',
  media_not_ready: 'publishError.mediaNotReady',
  missed_while_suspended: 'publishError.missedWhileSuspended',
  account_disconnected: 'publishError.accountDisconnected'
}
