<script setup lang="ts">
import { WORKSPACE_ROLE_META } from '#shared/utils/status'

interface Member { id: string, role: 'owner' | 'editor' | 'viewer', isActive: boolean, userId: string, name: string, email: string, image: string | null, lastSeenAt: string | null }
interface Invitation { id: string, email: string, name: string | null, role: 'editor' | 'viewer', expiresAt: string }
interface Team { members: Member[], invitations: Invitation[], seats: { used: number, pending: number, limit: number } }

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
useHead({ title: () => t('team.title') })

const team = ref<Team | null>(null)
async function load() {
  team.value = await apiFetch<Team>('/api/app/team')
}
onMounted(async () => {
  await entitlements.load()
  await load()
})
const locked = computed(() => entitlements.data.value !== null && !entitlements.has('teamAccess'))

const roles = computed(() => (['editor', 'viewer'] as const).map(value => ({ value, label: t(`role.${value}.label`), description: t(`role.${value}.summary`) })))
const inviteOpen = ref(false)
const inviteForm = reactive({ email: '', name: '', role: 'editor' as 'editor' | 'viewer' })
const inviting = ref(false)

async function invite() {
  inviting.value = true
  try {
    await apiFetch('/api/app/team/invitations', { method: 'POST', body: { ...inviteForm, name: inviteForm.name || undefined } })
    toast.add({ title: t('team.invited', { email: inviteForm.email }), color: 'success' })
    inviteOpen.value = false
    Object.assign(inviteForm, { email: '', name: '', role: 'editor' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    inviting.value = false
  }
}

async function revoke(invitation: Invitation) {
  if (!(await confirm({ title: t('team.revokeConfirm', { email: invitation.email }), color: 'error', confirmLabel: t('team.revoke') }))) return
  await apiFetch(`/api/app/team/invitations/${invitation.id}`, { method: 'DELETE' })
  await load()
}

async function update(member: Member, body: { role?: string, isActive?: boolean }) {
  if (body.isActive === false && !(await confirm({ title: t('team.deactivateConfirm', { name: member.name }), color: 'error', confirmLabel: t('team.deactivate') }))) return
  try {
    await apiFetch(`/api/app/team/members/${member.id}`, { method: 'PATCH', body })
    toast.add({ title: t('team.saved'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
  await load()
}

const seatsLabel = computed(() => {
  const seats = team.value?.seats
  if (!seats) return ''
  return seats.limit === -1 ? t('team.seatsUnlimited', { used: seats.used }) : t('team.seats', { used: seats.used + seats.pending, limit: seats.limit })
})
</script>

<template>
  <div class="w-full max-w-3xl mx-auto space-y-6">
    <CommandBar
      :title="t('team.title')"
      :description="t('team.subtitle')"
    >
      <UButton
        v-if="!locked"
        icon="i-lucide-user-plus"
        :label="t('team.invite')"
        @click="inviteOpen = true"
      />
    </CommandBar>

    <UCard
      v-if="locked"
      class="text-center"
    >
      <UIcon
        name="i-lucide-lock"
        class="size-8 text-muted mx-auto"
      />
      <p class="font-semibold text-highlighted mt-3">
        {{ t('team.locked') }}
      </p>
      <p class="text-sm text-muted mt-1">
        {{ t('team.lockedBody') }}
      </p>
      <UButton
        :to="localePath('/app/billing')"
        :label="t('team.seePlans')"
        class="mt-4"
      />
    </UCard>

    <template v-if="team">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">
              {{ t('team.members') }}
            </h2>
            <span class="text-sm text-muted">{{ seatsLabel }}</span>
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="member in team.members"
            :key="member.id"
            class="px-4 py-3 flex flex-wrap items-center gap-3"
          >
            <UAvatar
              :src="member.image ?? undefined"
              :alt="member.name"
            />
            <div class="min-w-0 flex-1">
              <p
                class="font-medium truncate"
                :class="member.isActive ? 'text-highlighted' : 'text-muted'"
              >
                {{ member.name }}<span
                  v-if="member.userId === auth.profile.value?.user.id"
                  class="text-muted font-normal"
                > · {{ t('team.you') }}</span>
              </p>
              <p class="text-sm text-muted truncate">
                {{ member.email }}
              </p>
            </div>
            <UBadge
              v-if="!member.isActive"
              color="neutral"
              variant="subtle"
              :label="t('team.inactive')"
            />
            <USelect
              v-if="member.role !== 'owner' && member.userId !== auth.profile.value?.user.id && member.isActive"
              :model-value="member.role"
              :items="roles"
              class="w-36"
              @update:model-value="(role: string) => update(member, { role })"
            />
            <StatusBadge
              v-else
              :value="member.role"
              :meta="WORKSPACE_ROLE_META"
            />
            <UButton
              v-if="member.role !== 'owner' && member.userId !== auth.profile.value?.user.id"
              size="sm"
              color="neutral"
              variant="ghost"
              :label="member.isActive ? t('team.deactivate') : t('team.reactivate')"
              @click="update(member, { isActive: !member.isActive })"
            />
          </li>
        </ul>
      </UCard>

      <UCard
        v-if="team.invitations.length"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <h2 class="font-semibold">
            {{ t('team.pending') }}
          </h2>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="invitation in team.invitations"
            :key="invitation.id"
            class="px-4 py-3 flex flex-wrap items-center gap-3"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium truncate">
                {{ invitation.name || invitation.email }}
              </p>
              <p class="text-sm text-muted">
                {{ t(`role.${invitation.role}.label`) }} · {{ t('team.expires', { date: formatDate(invitation.expiresAt, { locale }) }) }}
              </p>
            </div>
            <UButton
              size="sm"
              color="error"
              variant="ghost"
              :label="t('team.revoke')"
              @click="revoke(invitation)"
            />
          </li>
        </ul>
      </UCard>
    </template>

    <FormSlideover
      v-model:open="inviteOpen"
      :title="t('team.inviteTitle')"
      :loading="inviting"
      :submit-label="t('team.invite')"
      @submit="invite"
    >
      <div class="space-y-4">
        <UFormField
          :label="t('team.email')"
          name="email"
          required
        >
          <UInput
            v-model="inviteForm.email"
            type="email"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('team.name')"
          name="name"
        >
          <UInput
            v-model="inviteForm.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('team.role')"
          name="role"
        >
          <URadioGroup
            v-model="inviteForm.role"
            :items="roles"
            variant="card"
          />
        </UFormField>
      </div>
    </FormSlideover>
  </div>
</template>
