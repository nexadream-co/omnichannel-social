<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { useCelebrate } from '~/composables/useCelebrate'

/** A scheduled post that missed its time, with the one button that fixes it. Used on Beranda and in Postingan. */
export interface OverdueTarget { id: string, platform: Platform, status: string, accountStatus?: string }
export interface OverduePost {
  id: string
  caption: string
  scheduledAt: string | null
  thumbnail?: { url: string | null, kind: 'image' | 'video' } | null
  targets: OverdueTarget[]
}

const props = defineProps<{ post: OverduePost }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const { spark } = useCelebrate()

const canWrite = computed(() => auth.hasAbility('posts.write'))
// Targets still waiting to go out; the ones already published or cancelled are not ours to touch.
const waiting = computed(() => props.post.targets.filter(target => ['scheduled', 'needs_reauth', 'quota_deferred'].includes(target.status)))
const blocked = computed(() => waiting.value.filter(target => target.accountStatus && target.accountStatus !== 'active'))
const platformNames = computed(() => [...new Set(blocked.value.map(target => PLATFORM_META[target.platform].name))].join(', '))

const late = computed(() => {
  const ms = props.post.scheduledAt ? Date.now() - new Date(props.post.scheduledAt).getTime() : 0
  const hours = Math.max(1, Math.floor(ms / 3_600_000))
  return hours >= 48 ? t('posts.overdueFor', { n: Math.floor(hours / 24) }) : t('posts.overdueForHours', { n: hours })
})

const publishing = ref(false)
async function publishNow(event: MouseEvent) {
  publishing.value = true
  try {
    for (const target of waiting.value) await apiFetch(`/api/app/post-targets/${target.id}/retry`, { method: 'POST' })
    spark(event)
    toast.add({ title: t('posts.publishingNow'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    publishing.value = false
    emit('changed')
  }
}
</script>

<template>
  <div class="rounded-lg border border-warning/40 bg-warning/5 p-3 sm:p-4">
    <div class="flex gap-3">
      <NuxtLink
        :to="localePath(`/app/posts/${post.id}`)"
        class="shrink-0"
        :aria-label="t('posts.detail')"
      >
        <SmartImage
          :src="post.thumbnail?.kind === 'image' ? post.thumbnail.url : null"
          kind="post"
          :title="post.caption"
          class="size-12 sm:size-14 rounded-md"
        />
      </NuxtLink>
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UBadge
            color="warning"
            variant="subtle"
            icon="i-lucide-clock-alert"
            :label="late"
          />
          <span class="flex gap-1 text-muted">
            <UIcon
              v-for="p in [...new Set(post.targets.map(x => x.platform))]"
              :key="p"
              :name="PLATFORM_META[p].icon"
              class="size-4"
            />
          </span>
        </div>
        <NuxtLink
          :to="localePath(`/app/posts/${post.id}`)"
          class="block text-sm text-highlighted line-clamp-1 break-words"
        >
          {{ post.caption || t('posts.noCaption') }}
        </NuxtLink>
        <p class="text-sm text-muted">
          {{ blocked.length ? t('posts.overdueReconnect', { platform: platformNames }) : t('posts.overdueReady') }}
        </p>
      </div>
    </div>
    <div
      v-if="canWrite && waiting.length"
      class="mt-3 flex"
    >
      <UButton
        v-if="blocked.length"
        :to="localePath('/app/accounts')"
        color="warning"
        icon="i-lucide-plug-zap"
        :label="t('posts.reconnectPlatform', { platform: platformNames })"
        class="w-full sm:w-auto justify-center"
      />
      <UButton
        v-else
        color="primary"
        icon="i-lucide-send"
        :loading="publishing"
        :label="publishing ? t('busy.publishing') : t('posts.publishNow')"
        class="w-full sm:w-auto justify-center"
        @click="publishNow"
      />
    </div>
  </div>
</template>
