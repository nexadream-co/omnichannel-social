<script setup lang="ts">
import { RULE_TEMPLATES } from '#shared/utils/autoreply'

interface RuleRow {
  id: string
  name: string
  scope: 'post' | 'global'
  keywords: string[]
  active: boolean
  pausedReason: 'plan_limit' | 'kill_switch' | 'account_disabled' | null
  linkTitle: string | null
  linkImage: string | null
  accountUsername: string | null
  accountStatus: string
  sent: number
  sent7d: number
}

definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { confirm } = useConfirmDialog()
const entitlements = useEntitlements()
useHead({ title: () => t('autoReply.title') })

const rules = ref<RuleRow[] | null>(null)
const hasInstagram = ref(true)
async function load() {
  const [list, channels] = await Promise.all([
    apiFetch<{ items: RuleRow[] }>('/api/app/autoreply/rules'),
    apiFetch<{ items: { platform: string, status: string }[] }>('/api/app/channels')
  ])
  rules.value = list.items
  hasInstagram.value = channels.items.some(a => a.platform === 'instagram' && a.status !== 'revoked')
}
onMounted(load)

async function toggle(rule: RuleRow, active: boolean) {
  const previous = rule.active
  rule.active = active
  try {
    await apiFetch(`/api/app/autoreply/rules/${rule.id}`, { method: 'PATCH', body: { active } })
  } catch (caught) {
    rule.active = previous
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

async function remove(rule: RuleRow) {
  if (!await confirm({ title: rule.name, description: t('autoReply.deleteConfirm'), confirmLabel: t('common.remove'), color: 'error' })) return
  await apiFetch(`/api/app/autoreply/rules/${rule.id}`, { method: 'DELETE' })
  toast.add({ title: t('autoReply.deleted'), color: 'success' })
  await load()
}
</script>

<template>
  <div class="w-full max-w-4xl mx-auto space-y-6">
    <CommandBar
      :title="t('autoReply.title')"
      :description="t('autoReply.subtitle')"
    >
      <UButton
        :to="localePath('/app/auto-reply/activity')"
        icon="i-lucide-history"
        color="neutral"
        variant="outline"
        :label="t('autoReply.activity')"
      />
      <UButton
        v-if="hasInstagram"
        :to="localePath('/app/auto-reply/new')"
        icon="i-lucide-plus"
        :label="t('autoReply.create')"
      />
    </CommandBar>

    <div
      v-if="!rules"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-24 w-full"
      />
    </div>

    <UCard
      v-else-if="!hasInstagram"
      class="text-center"
    >
      <UIcon
        name="i-simple-icons-instagram"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-default">
        {{ t('autoReply.needInstagram') }}
      </p>
      <UButton
        :to="localePath('/app/accounts')"
        icon="i-lucide-plus"
        class="mt-4"
        :label="t('autoReply.connect')"
      />
    </UCard>

    <template v-else>
      <UCard v-if="!rules.length">
        <div class="flex flex-col sm:flex-row gap-4 items-start">
          <div class="size-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UIcon
              name="i-lucide-message-circle-reply"
              class="size-6"
            />
          </div>
          <div>
            <h2 class="font-semibold text-highlighted">
              {{ t('autoReply.emptyTitle') }}
            </h2>
            <p class="text-sm text-muted mt-1">
              {{ t('autoReply.emptyBody') }}
            </p>
          </div>
        </div>
      </UCard>

      <ul
        v-else
        class="space-y-3"
      >
        <li
          v-for="rule in rules"
          :key="rule.id"
        >
          <UCard :ui="{ body: 'p-4 sm:p-4' }">
            <div class="flex items-start gap-3">
              <img
                v-if="rule.linkImage"
                :src="rule.linkImage"
                alt=""
                class="size-14 rounded-md object-cover shrink-0"
              >
              <div
                v-else
                class="size-14 rounded-md bg-elevated shrink-0 flex items-center justify-center"
              >
                <UIcon
                  name="i-lucide-message-circle"
                  class="size-6 text-muted"
                />
              </div>
              <div class="min-w-0 flex-1 space-y-1.5">
                <NuxtLink
                  :to="localePath(`/app/auto-reply/${rule.id}`)"
                  class="font-medium text-highlighted hover:text-primary block truncate"
                >
                  {{ rule.name }}
                </NuxtLink>
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="keyword in rule.keywords"
                    :key="keyword"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="keyword"
                  />
                  <UBadge
                    v-if="!rule.keywords.length"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="t('autoReply.anyComment')"
                  />
                </div>
                <p class="text-xs text-muted flex flex-wrap gap-x-2">
                  <span>@{{ rule.accountUsername }} · {{ rule.scope === 'post' ? t('autoReply.onePost') : t('autoReply.allPosts') }}</span>
                  <span
                    v-if="rule.linkTitle"
                    class="truncate max-w-56"
                  >· {{ rule.linkTitle }}</span>
                </p>
                <p class="text-xs">
                  <span class="text-default font-medium">{{ t('autoReply.sent', { n: rule.sent }) }}</span>
                  <span class="text-muted"> · {{ t('autoReply.sent7d', { n: rule.sent7d }) }}</span>
                </p>
                <UBadge
                  v-if="rule.pausedReason"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  :label="t(`autoReply.paused.${rule.pausedReason}`)"
                />
              </div>
              <div class="flex flex-col items-end gap-2 shrink-0">
                <USwitch
                  :model-value="rule.active"
                  :aria-label="rule.active ? t('autoReply.on') : t('autoReply.off')"
                  @update:model-value="(v: boolean) => toggle(rule, v)"
                />
                <UDropdownMenu
                  :items="[
                    { label: t('autoReply.editTitle'), icon: 'i-lucide-pencil', to: localePath(`/app/auto-reply/${rule.id}`) },
                    { label: t('autoReply.activity'), icon: 'i-lucide-history', to: localePath(`/app/auto-reply/activity?rule=${rule.id}`) },
                    { label: t('common.remove'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(rule) }
                  ]"
                >
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-ellipsis-vertical"
                    :aria-label="t('common.more')"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </UCard>
        </li>
      </ul>

      <div>
        <p class="text-sm font-medium text-highlighted mb-2">
          {{ t('autoReply.templatesTitle') }}
        </p>
        <div class="grid gap-2 sm:grid-cols-3">
          <NuxtLink
            v-for="template in RULE_TEMPLATES"
            :key="template.key"
            :to="localePath(`/app/auto-reply/new?template=${template.key}`)"
            class="rounded-lg border border-default p-3 text-sm text-default hover:border-primary hover:bg-elevated/50 transition-colors flex items-start gap-2"
          >
            <UIcon
              name="i-lucide-sparkles"
              class="size-4 text-primary shrink-0 mt-0.5"
            />
            <span>{{ t(template.titleKey) }}</span>
          </NuxtLink>
        </div>
      </div>
    </template>
  </div>
</template>
