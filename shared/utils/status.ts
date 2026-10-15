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
