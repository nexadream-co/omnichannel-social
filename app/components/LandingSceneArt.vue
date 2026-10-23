<script setup lang="ts">
/**
 * Smaller landing illustrations: the three "how it works" steps (connect, compose, time), the
 * beginner checklist, the help chat by the contact form and the relaxed ending. Decorative
 * (aria-hidden); the text next to each carries the meaning.
 */
defineProps<{ kind: 'connect' | 'compose' | 'time' | 'guide' | 'help' | 'relax' }>()
const { t } = useI18n()

const PLATFORMS = ['i-simple-icons-instagram', 'i-simple-icons-threads', 'i-simple-icons-facebook']
const GUIDE = [
  { key: 'connect', state: 'done' },
  { key: 'etalase', state: 'done' },
  { key: 'product', state: 'now' },
  { key: 'post', state: 'todo' }
] as const
</script>

<template>
  <div aria-hidden="true">
    <!-- Step 1: the accounts, connected -->
    <div
      v-if="kind === 'connect'"
      class="flex h-32 flex-col items-center justify-center gap-3"
    >
      <div class="flex gap-3">
        <span
          v-for="icon in PLATFORMS"
          :key="icon"
          class="relative flex size-12 items-center justify-center rounded-xl border border-default bg-default text-highlighted shadow-sm"
        >
          <UIcon
            :name="icon"
            class="size-5"
          />
          <span class="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-green-600 text-white ring-2 ring-(--ui-bg)">
            <UIcon
              name="i-lucide-check"
              class="size-3"
            />
          </span>
        </span>
      </div>
      <span class="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold art-ok">{{ t('landing.art.connected') }}</span>
    </div>

    <!-- Step 2: photo, caption, product link -->
    <div
      v-else-if="kind === 'compose'"
      class="flex h-32 items-center justify-center"
    >
      <div class="flex w-60 max-w-full gap-2.5 rounded-xl border border-default bg-default p-2.5 shadow-sm">
        <LandingArtPhoto
          class="size-16 shrink-0 rounded-lg"
          icon-class="size-7"
        />
        <div class="flex min-w-0 flex-1 flex-col justify-between">
          <div class="space-y-1.5 pt-1">
            <div class="h-1.5 w-full rounded-full bg-accented" />
            <div class="h-1.5 w-3/4 rounded-full bg-accented" />
          </div>
          <span class="inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium art-ink">
            <UIcon
              name="i-lucide-link"
              class="size-3"
            />
            {{ t('landing.art.productLink') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Step 3: pick a time, it publishes itself -->
    <div
      v-else-if="kind === 'time'"
      class="flex h-32 items-center justify-center"
    >
      <div class="w-52 rounded-xl border border-default bg-default p-3 shadow-sm">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-clock"
            class="size-5 art-ink"
          />
          <span class="text-xl font-bold tabular-nums text-highlighted">{{ t('landing.art.time') }}</span>
        </div>
        <div class="mt-2.5 flex items-center justify-between border-t border-default pt-2.5">
          <span class="text-[11px] font-medium text-default">{{ t('landing.art.auto') }}</span>
          <span class="flex h-4 w-7 items-center justify-end rounded-full bg-primary p-0.5">
            <span class="size-3 rounded-full bg-white" />
          </span>
        </div>
      </div>
    </div>

    <!-- The beginner checklist, half done -->
    <div
      v-else-if="kind === 'guide'"
      class="relative mx-auto w-full max-w-xs"
    >
      <div class="absolute inset-[8%] rounded-full bg-primary/15 blur-3xl" />
      <div class="relative rounded-2xl border border-default bg-default p-4 shadow-xl">
        <div class="flex items-baseline justify-between">
          <p class="text-sm font-semibold text-highlighted">
            {{ t('landing.art.guide.title') }}
          </p>
          <span class="text-xs text-muted">{{ t('landing.art.guide.progress') }}</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div class="h-full w-1/2 rounded-full bg-primary" />
        </div>
        <ul class="mt-4 space-y-2">
          <li
            v-for="item in GUIDE"
            :key="item.key"
            class="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm"
            :class="item.state === 'now' ? 'bg-primary/10 ring-1 ring-primary/30' : ''"
          >
            <span
              class="flex size-5 shrink-0 items-center justify-center rounded-full"
              :class="{
                'bg-green-600 text-white': item.state === 'done',
                'border-2 border-primary': item.state === 'now',
                'border-2 border-accented': item.state === 'todo'
              }"
            >
              <UIcon
                v-if="item.state === 'done'"
                name="i-lucide-check"
                class="size-3"
              />
            </span>
            <span :class="item.state === 'done' ? 'text-muted line-through' : item.state === 'now' ? 'font-medium text-highlighted' : 'text-muted'">
              {{ t(`landing.art.guide.${item.key}`) }}
            </span>
            <UIcon
              v-if="item.state === 'now'"
              name="i-lucide-arrow-right"
              class="ml-auto size-4 art-ink"
            />
          </li>
        </ul>
      </div>
    </div>

    <!-- A question by chat, answered kindly -->
    <div
      v-else-if="kind === 'help'"
      class="flex max-w-xs flex-col gap-2"
    >
      <div class="flex items-end gap-2">
        <span class="size-6 shrink-0 rounded-full bg-amber-300" />
        <span class="rounded-2xl rounded-bl-sm border border-default bg-default px-3 py-1.5 text-xs shadow-sm">
          {{ t('landing.art.help.question') }}
        </span>
      </div>
      <div class="flex items-end justify-end gap-2">
        <span class="rounded-2xl rounded-br-sm art-chip px-3 py-1.5 text-xs shadow-sm">
          {{ t('landing.art.help.answer') }}
        </span>
        <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 art-ink">
          <UIcon
            name="i-lucide-headset"
            class="size-3.5"
          />
        </span>
      </div>
    </div>

    <!-- You relax, the posts go out -->
    <div
      v-else
      class="flex items-center justify-center gap-3"
    >
      <span class="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
        <UIcon
          name="i-lucide-coffee"
          class="size-7"
        />
      </span>
      <div class="rounded-xl border border-default bg-default px-3 py-2 text-left shadow-sm">
        <p class="flex items-center gap-1.5 text-xs font-semibold text-highlighted">
          <UIcon
            name="i-lucide-circle-check"
            class="size-4 art-ok"
          />
          {{ t('landing.art.relax') }}
        </p>
        <div class="mt-1 flex gap-1.5 pl-5.5 text-muted">
          <UIcon
            v-for="icon in PLATFORMS"
            :key="icon"
            :name="icon"
            class="size-3"
          />
        </div>
      </div>
    </div>
  </div>
</template>
