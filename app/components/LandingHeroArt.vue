<script setup lang="ts">
/**
 * Landing hero illustration: a creator's post on a phone, with the three things that now happen on
 * their own floating around it (scheduled, a comment answered in the DMs, clicks on the Etalase).
 * Positions are percentages of a fixed-ratio box, so it scales from phones to desktop.
 */
const { t } = useI18n()

const PLATFORMS = ['i-simple-icons-instagram', 'i-simple-icons-threads', 'i-simple-icons-facebook']
const BARS = [35, 55, 45, 70, 100]
</script>

<template>
  <div
    class="relative mx-auto aspect-[10/9] w-full max-w-md"
    aria-hidden="true"
  >
    <div class="absolute inset-[10%] rounded-full bg-primary/15 blur-3xl" />

    <!-- The phone -->
    <div class="absolute top-[3%] left-1/2 h-[94%] w-[50%] -translate-x-1/2 overflow-hidden rounded-[2rem] border-[6px] border-zinc-900 bg-default shadow-2xl shadow-primary/10 dark:border-zinc-700">
      <div class="mx-auto mt-1.5 h-1.5 w-12 rounded-full bg-zinc-900 dark:bg-zinc-700" />
      <div class="flex items-center gap-1.5 px-2.5 pt-2.5">
        <span class="size-5 rounded-full bg-linear-to-br from-amber-300 to-primary" />
        <span class="text-[10px] font-semibold text-highlighted">tokoayu</span>
        <UIcon
          name="i-simple-icons-instagram"
          class="ml-auto size-3 text-muted"
        />
      </div>
      <div class="relative mt-2">
        <LandingArtPhoto
          class="aspect-[4/5] w-full"
          icon-class="size-16"
        />
        <span class="absolute top-2 right-2 rotate-6 rounded-md art-chip px-1.5 py-0.5 text-[10px] font-bold shadow-sm">
          {{ t('landing.art.price') }}
        </span>
      </div>
      <div class="flex items-center gap-2 px-2.5 pt-2 text-highlighted">
        <UIcon
          name="i-lucide-heart"
          class="size-3.5 art-ink"
        />
        <UIcon
          name="i-lucide-message-circle"
          class="size-3.5"
        />
        <UIcon
          name="i-lucide-send"
          class="size-3.5"
        />
        <UIcon
          name="i-lucide-bookmark"
          class="ml-auto size-3.5"
        />
      </div>
      <div class="space-y-1 px-2.5 pt-2">
        <div class="h-1.5 w-11/12 rounded-full bg-accented" />
        <div class="h-1.5 w-2/3 rounded-full bg-accented" />
        <p class="text-[9px] text-sky-700 dark:text-sky-400">
          #outfitharian #tasselempang
        </p>
      </div>
    </div>

    <!-- Scheduled once, published everywhere -->
    <div
      class="art-float absolute top-[10%] left-0 w-[44%] rounded-xl border border-default bg-default p-2.5 shadow-lg"
      style="animation-delay: -1s"
    >
      <div class="flex items-center gap-2">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 art-ink">
          <UIcon
            name="i-lucide-calendar-clock"
            class="size-4"
          />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold text-highlighted">
            {{ t('landing.art.hero.scheduled') }}
          </p>
          <p class="truncate text-[10px] text-muted">
            {{ t('landing.art.hero.today') }}
          </p>
        </div>
      </div>
      <div class="mt-2 flex items-center gap-1.5 text-muted">
        <UIcon
          v-for="icon in PLATFORMS"
          :key="icon"
          :name="icon"
          class="size-3"
        />
        <UIcon
          name="i-lucide-circle-check"
          class="ml-auto size-3.5 art-ok"
        />
      </div>
    </div>

    <!-- A buyer's comment, answered by itself -->
    <div
      class="art-float absolute top-[42%] right-0 w-[46%] rounded-xl border border-default bg-default p-2.5 shadow-lg"
      style="animation-delay: -2.5s"
    >
      <div class="flex items-center gap-1.5">
        <span class="size-4 shrink-0 rounded-full bg-sky-300" />
        <span class="rounded-xl rounded-tl-sm bg-elevated px-2 py-0.5 text-[10px] text-default">{{ t('landing.art.hero.comment') }}</span>
      </div>
      <p class="mt-1.5 flex items-center gap-1 text-[10px] font-semibold art-ok">
        <UIcon
          name="i-lucide-check-check"
          class="size-3.5 shrink-0"
        />
        {{ t('landing.art.hero.sent') }}
      </p>
    </div>

    <!-- Clicks on the Etalase -->
    <div
      class="art-float absolute bottom-[6%] left-[2%] w-[40%] rounded-xl border border-default bg-default p-2.5 shadow-lg"
      style="animation-delay: -4s"
    >
      <div class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-store"
          class="size-3.5 art-ink"
        />
        <span class="text-[11px] font-semibold text-highlighted">{{ t('landing.art.hero.etalase') }}</span>
      </div>
      <div class="mt-1.5 flex items-end gap-2">
        <div class="flex h-6 flex-1 items-end gap-0.5">
          <span
            v-for="(h, i) in BARS"
            :key="i"
            class="flex-1 rounded-t-[2px]"
            :class="i === BARS.length - 1 ? 'bg-primary' : 'bg-primary/35'"
            :style="{ height: `${h}%` }"
          />
        </div>
      </div>
      <p class="mt-1 text-[10px] text-muted">
        {{ t('landing.art.hero.clicks') }}
      </p>
    </div>
  </div>
</template>
