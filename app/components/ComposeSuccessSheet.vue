<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { clockLabel } from '~/utils/compose-when'

export type SuccessChoice = 'autoReply' | 'again' | 'calendar'

/** The first-post moment: when it goes live, a little preview, a countdown, and what to do next. */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  scheduledAt: string
  tz: string
  caption: string
  imageUrl: string | null
  canAutoReply: boolean
}>()
const emit = defineEmits<{ choose: [choice: SuccessChoice], dismiss: [] }>()
const { t, locale } = useI18n()

const now = ref(Date.now())
const { pause, resume } = useIntervalFn(() => {
  now.value = Date.now()
}, 60_000, { immediate: false })
watch(open, (value) => {
  if (value) {
    now.value = Date.now()
    chosen = false
    resume()
  } else {
    pause()
    if (!chosen) emit('dismiss')
  }
})
onScopeDispose(pause)
let chosen = false

const intl = computed(() => locale.value === 'en' ? 'en-GB' : 'id-ID')
const day = computed(() => new Intl.DateTimeFormat(intl.value, { weekday: 'long', day: 'numeric', month: 'long', timeZone: props.tz }).format(new Date(props.scheduledAt)))
const time = computed(() => clockLabel(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: props.tz }).format(new Date(props.scheduledAt)), locale.value))
const countdown = computed(() => {
  const minutes = Math.max(0, Math.round((new Date(props.scheduledAt).getTime() - now.value) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days >= 1) return t('composer.success.countdownDays', { d: days, h: hours })
  return t('composer.success.countdown', { h: hours, m: minutes % 60 })
})

function choose(choice: SuccessChoice) {
  chosen = true
  open.value = false
  emit('choose', choice)
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('composer.success.title')"
  >
    <template #body>
      <div class="space-y-4">
        <i18n-t
          keypath="composer.success.body"
          tag="p"
          class="text-default"
        >
          <template #when>
            <strong class="text-highlighted">{{ day }}, {{ time }}</strong>
          </template>
        </i18n-t>
        <div class="flex gap-3 rounded-md border border-default p-3">
          <SmartImage
            :src="imageUrl"
            kind="post"
            class="size-16 rounded-md shrink-0"
          />
          <p class="text-sm text-muted line-clamp-2 break-words whitespace-pre-line min-w-0">
            {{ caption || t('posts.noCaption') }}
          </p>
        </div>
        <p class="flex items-center gap-2 text-sm text-primary">
          <UIcon
            name="i-lucide-timer"
            class="size-4"
          />
          {{ countdown }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex flex-col gap-2 w-full">
        <UButton
          v-if="canAutoReply"
          block
          icon="i-lucide-message-circle-reply"
          :label="t('composer.autoReplyAction')"
          @click="choose('autoReply')"
        />
        <UButton
          block
          :color="canAutoReply ? 'neutral' : 'primary'"
          :variant="canAutoReply ? 'outline' : 'solid'"
          icon="i-lucide-calendar-days"
          :label="t('composer.success.calendar')"
          @click="choose('calendar')"
        />
        <UButton
          block
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :label="t('composer.success.again')"
          @click="choose('again')"
        />
      </div>
    </template>
  </ResponsiveSheet>
</template>
