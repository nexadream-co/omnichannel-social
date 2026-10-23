<script setup lang="ts">
/**
 * Landing feature illustrations: a small, tidy mock of the Socialz.id screen that fixes each pain in
 * LandingPainArt (same keys). Decorative (aria-hidden); the card text carries the meaning.
 */
defineProps<{ kind: 'schedule' | 'editor' | 'hashtags' | 'links' | 'etalase' | 'reply' }>()
const { t } = useI18n()

const PLATFORMS = ['i-simple-icons-instagram', 'i-simple-icons-threads', 'i-simple-icons-facebook']
// Days with a post planned; Friday (4) is the one in the card below.
const PLANNED = [0, 2, 4, 5]
const BARS = [30, 42, 38, 55, 64, 78, 100]
const TAGS = [
  { tag: '#outfitharian', state: 'good' },
  { tag: '#ootdhijab', state: 'good' },
  { tag: '#fyp', state: 'general' },
  { tag: '#tasselempang', state: 'suggest' }
] as const
const SHOP = ['i-lucide-shirt', 'i-lucide-watch', 'i-lucide-footprints', 'i-lucide-glasses']
</script>

<template>
  <div
    class="relative h-44 overflow-hidden rounded-lg bg-primary/5 ring-1 ring-primary/10"
    aria-hidden="true"
  >
    <!-- A week planned ahead, published by itself -->
    <template v-if="kind === 'schedule'">
      <div class="absolute inset-0 flex flex-col justify-center gap-3 px-4">
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="(day, i) in t('landing.art.days').split(' ')"
            :key="day"
            class="flex flex-col items-center gap-1"
          >
            <span class="text-[10px] text-dimmed">{{ day }}</span>
            <LandingArtPhoto
              v-if="PLANNED.includes(i)"
              :tone="i"
              icon-class="size-3.5"
              class="aspect-square w-full rounded-md"
              :class="i === 4 && 'ring-2 ring-primary ring-offset-1 ring-offset-(--ui-bg)'"
            />
            <span
              v-else
              class="aspect-square w-full rounded-md border border-dashed border-accented"
            />
          </div>
        </div>
        <div class="flex items-center gap-2 rounded-lg border border-default bg-default p-2 shadow-sm">
          <UIcon
            name="i-lucide-calendar-clock"
            class="size-4 shrink-0 art-ink"
          />
          <span class="text-[11px] font-semibold text-highlighted">{{ t('landing.art.scheduled') }}</span>
          <span class="ml-auto flex items-center gap-1 text-muted">
            <UIcon
              v-for="icon in PLATFORMS"
              :key="icon"
              :name="icon"
              class="size-3"
            />
          </span>
          <UIcon
            name="i-lucide-circle-check"
            class="size-4 shrink-0 art-ok"
          />
        </div>
      </div>
    </template>

    <!-- The product framed for the feed, with a price tag -->
    <template v-else-if="kind === 'editor'">
      <div class="absolute inset-0 flex items-center justify-center gap-4 px-4">
        <div class="relative h-32 w-26">
          <LandingArtPhoto
            class="size-full rounded-md"
            icon-class="size-14"
          />
          <span
            v-for="corner in ['-top-1 -left-1 border-t-2 border-l-2', '-top-1 -right-1 border-t-2 border-r-2', '-bottom-1 -left-1 border-b-2 border-l-2', '-bottom-1 -right-1 border-b-2 border-r-2']"
            :key="corner"
            class="absolute size-3 border-primary"
            :class="corner"
          />
          <span class="absolute -left-4 top-4 -rotate-6 rounded-md art-chip px-1.5 py-0.5 text-[11px] font-bold shadow-sm">
            {{ t('landing.art.price') }}
          </span>
          <span class="absolute inset-x-0 bottom-2 text-center text-[10px] font-extrabold tracking-wide text-white drop-shadow">PROMO</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <span
            v-for="(r, i) in ['feed', 'square', 'reels']"
            :key="r"
            class="rounded-md px-2 py-1 text-[11px] font-medium"
            :class="i === 0 ? 'art-chip' : 'border border-default bg-default text-muted'"
          >{{ t(`landing.art.ratio.${r}`) }}</span>
        </div>
      </div>
    </template>

    <!-- Hashtags checked against the caption -->
    <template v-else-if="kind === 'hashtags'">
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-64 max-w-full rounded-lg border border-default bg-default p-3 shadow-sm">
          <div class="space-y-1.5">
            <div class="h-1.5 w-11/12 rounded-full bg-accented" />
            <div class="h-1.5 w-1/2 rounded-full bg-accented" />
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="item in TAGS"
              :key="item.tag"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="{
                'bg-success/15 art-ok': item.state === 'good',
                'bg-warning/15 art-warn': item.state === 'general',
                'border border-dashed border-primary art-ink': item.state === 'suggest'
              }"
            >
              <UIcon
                :name="item.state === 'good' ? 'i-lucide-check' : item.state === 'general' ? 'i-lucide-triangle-alert' : 'i-lucide-plus'"
                class="size-3"
              />
              {{ item.tag }}
            </span>
          </div>
          <p class="mt-2.5 flex items-center gap-1 text-[10px] art-warn">
            <UIcon
              name="i-lucide-info"
              class="size-3"
            />
            #fyp · {{ t('landing.art.tags.general') }}
          </p>
        </div>
      </div>
    </template>

    <!-- A short link and the clicks it got -->
    <template v-else-if="kind === 'links'">
      <div class="absolute inset-0 flex flex-col justify-center gap-3 px-5">
        <div class="flex items-center gap-2 rounded-lg border border-default bg-default px-2.5 py-2 shadow-sm">
          <UIcon
            name="i-lucide-link"
            class="size-4 shrink-0 art-ink"
          />
          <span class="truncate text-xs font-semibold text-highlighted">socialz.id/tas-kulit</span>
          <UIcon
            name="i-lucide-copy"
            class="ml-auto size-3.5 shrink-0 text-dimmed"
          />
        </div>
        <div class="flex items-end gap-3">
          <div class="flex h-14 flex-1 items-end gap-1">
            <span
              v-for="(h, i) in BARS"
              :key="i"
              class="flex-1 rounded-t-sm"
              :class="i === BARS.length - 1 ? 'bg-primary' : 'bg-primary/35'"
              :style="{ height: `${h}%` }"
            />
          </div>
          <div class="text-right">
            <p class="text-lg font-bold leading-none text-highlighted">
              128
            </p>
            <p class="mt-1 text-[10px] text-muted">
              {{ t('landing.art.clicks') }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Every product behind one bio link -->
    <template v-else-if="kind === 'etalase'">
      <div class="absolute inset-x-0 top-4 mx-auto w-36 rounded-t-2xl border-4 border-b-0 border-zinc-800 bg-default px-2.5 pt-2.5 dark:border-zinc-600">
        <div class="flex flex-col items-center">
          <span class="size-7 rounded-full bg-primary/30" />
          <p class="mt-1 text-[10px] font-semibold text-highlighted">
            @tokoayu
          </p>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-1.5">
          <div
            v-for="(icon, i) in SHOP"
            :key="icon"
            class="rounded-md border border-default p-1"
          >
            <LandingArtPhoto
              :icon="icon"
              :tone="i"
              icon-class="size-4"
              class="h-9 rounded-sm"
            />
            <span class="mt-1 block rounded-sm art-chip py-px text-center text-[8px] font-semibold">{{ t('landing.art.buy') }}</span>
          </div>
        </div>
      </div>
      <span class="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-default px-2 py-0.5 text-[10px] font-semibold art-ink shadow-sm ring-1 ring-primary/20">
        <UIcon
          name="i-lucide-link-2"
          class="size-3"
        />
        {{ t('landing.art.oneLink') }}
      </span>
    </template>

    <!-- A comment answered in the DMs, by itself -->
    <template v-else>
      <div class="absolute inset-0 flex flex-col justify-center gap-2 px-5">
        <div class="flex items-center gap-2">
          <span class="size-6 shrink-0 rounded-full bg-amber-300" />
          <span class="rounded-2xl rounded-tl-sm border border-default bg-default px-2.5 py-1 text-[11px] shadow-sm">
            {{ t('landing.art.comments.c1') }}
          </span>
        </div>
        <div class="flex items-center gap-1.5 pl-8 art-ink">
          <UIcon
            name="i-lucide-corner-down-right"
            class="size-4"
          />
          <UIcon
            name="i-lucide-zap"
            class="size-3.5"
          />
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="max-w-[85%] rounded-2xl rounded-br-sm art-chip px-3 py-1.5 text-[11px] shadow-sm">
            {{ t('landing.art.dm') }} <span class="font-semibold underline">socialz.id/tas-kulit</span>
          </span>
          <span class="inline-flex items-center gap-1 text-[10px] font-medium art-ok">
            <UIcon
              name="i-lucide-check-check"
              class="size-3.5"
            />
            {{ t('landing.art.sent') }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
