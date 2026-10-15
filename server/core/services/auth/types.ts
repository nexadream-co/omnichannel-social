export type Audience = 'creator' | 'staff'

export interface SessionInfo {
  sessionId: string
  userId: string
  audience: Audience
  activeWorkspaceId: string | null
  impersonatedBy: string | null
  expiresAt: Date
}

export interface AuthUserBase {
  id: string
  name: string
  email: string
  phone: string | null
  image: string | null
  emailVerified: boolean
  isActive: boolean
}
