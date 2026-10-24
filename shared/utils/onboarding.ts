/** The getting-started checklist, in order (flags come from onboardingSteps in server/core/access.ts). */
export const ONBOARDING_STEPS = [
  { key: 'accountConnected', to: '/app/accounts', icon: 'i-lucide-at-sign', titleKey: 'onboarding.steps.accountConnected.title', bodyKey: 'onboarding.steps.accountConnected.body' },
  { key: 'postScheduled', to: '/app/compose', icon: 'i-lucide-calendar-plus', titleKey: 'onboarding.steps.postScheduled.title', bodyKey: 'onboarding.steps.postScheduled.body' },
  { key: 'bioCreated', to: '/app/bio', icon: 'i-lucide-store', titleKey: 'onboarding.steps.bioCreated.title', bodyKey: 'onboarding.steps.bioCreated.body' },
  { key: 'autoReplyAdded', to: '/app/auto-reply/new?template=mau', icon: 'i-lucide-message-circle-reply', titleKey: 'onboarding.steps.autoReplyAdded.title', bodyKey: 'onboarding.steps.autoReplyAdded.body' }
] as const

export type OnboardingStepKey = typeof ONBOARDING_STEPS[number]['key']
