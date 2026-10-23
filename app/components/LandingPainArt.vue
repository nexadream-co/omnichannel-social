<script setup lang="ts">
/**
 * Landing "Kenal rasanya?" illustrations: what each job feels like before Socialz.id, drawn as small
 * scenes from a newcomer's phone. One per feature card, keyed the same way. Decorative (aria-hidden);
 * the card text carries the meaning.
 */
defineProps<{ kind: 'schedule' | 'editor' | 'hashtags' | 'links' | 'etalase' | 'reply' }>()
const { t } = useI18n()

const STARS = [[12, 22], [28, 70], [46, 14], [64, 78], [82, 30], [90, 64], [20, 48], [72, 52]]
const PLATFORMS = ['i-simple-icons-instagram', 'i-simple-icons-threads', 'i-simple-icons-facebook']
const COMMENTS = [
  { key: 'c1', offset: 'ml-0', tone: 0 },
  { key: 'c2', offset: 'ml-6', tone: 1 },
  { key: 'c3', offset: 'ml-2', tone: 2 },
  { key: 'c4', offset: 'ml-8', tone: 3 }
]
const AVATARS = ['bg-amber-300', 'bg-sky-300', 'bg-emerald-300', 'bg-violet-300']
</script>

<template>
  <div
    class="relative h-44 overflow-hidden rounded-lg"
    :class="kind === 'schedule' ? 'bg-zinc-900 dark:ring-1 dark:ring-white/10' : 'bg-elevated/70'"
    aria-hidden="true"
  >
    <!-- Peak hour is late at night: an alarm, and the same post to copy into every app -->
    <template v-if="kind === 'schedule'">
      <span
        v-for="([x, y], i) in STARS"
        :key="i"
        class="absolute size-0.5 rounded-full bg-white/60"
        :style="{ left: `${x}%`, top: `${y}%` }"
      />
      <UIcon
        name="i-lucide-moon"
        class="absolute top-4 right-5 size-6 text-amber-200"
      />
      <span class="absolute top-5 left-5 text-xs font-semibold tracking-[0.3em] text-zinc-500">Zzz</span>
      <div class="absolute inset-x-0 top-1/2 mx-auto w-60 max-w-[85%] -translate-y-1/2 rounded-xl bg-white/10 p-3 text-white ring-1 ring-white/15">
        <div class="flex items-center gap-2.5">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-zinc-900">
            <UIcon
              name="i-lucide-alarm-clock"
              class="size-5"
            />
          </span>
          <div class="min-w-0">
            <p class="text-xs font-semibold">
              {{ t('landing.art.night.time') }}
            </p>
            <p class="text-[11px] text-zinc-300">
              {{ t('landing.art.night.alarm') }}
            </p>
          </div>
        </div>
        <div class="mt-2.5 flex gap-1.5">
          <span
            v-for="icon in PLATFORMS"
            :key="icon"
            class="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 py-1"
          >
            <UIcon
              :name="icon"
              class="size-3"
            />
            <UIcon
              name="i-lucide-copy"
              class="size-3 text-zinc-400"
            />
          </span>
        </div>
      </div>
    </template>

    <!-- The photo doesn't fit the post shape, so the product gets cut off -->
    <template v-else-if="kind === 'editor'">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="relative h-28 w-48">
          <LandingArtPhoto
            class="absolute inset-0 rounded-md opacity-35"
            icon-class="size-20 -translate-y-7 translate-x-10"
          />
          <!-- The square post frame shows only part of the wide photo -->
          <div class="absolute -top-2 left-4 size-28 overflow-hidden rounded-md border-2 border-dashed border-error">
            <LandingArtPhoto
              class="absolute -left-4.5 top-1.5 h-28 w-48"
              icon-class="size-20 -translate-y-7 translate-x-10"
            />
          </div>
          <span class="absolute -right-3 -bottom-4 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <UIcon
              name="i-lucide-scissors"
              class="size-3"
            />
            {{ t('landing.art.crop.cut') }}
          </span>
        </div>
      </div>
      <div class="absolute top-3 right-3 flex flex-col items-end gap-1">
        <span
          v-for="r in ['1:1', '4:5', '9:16']"
          :key="r"
          class="rounded-md border border-default bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted"
        >{{ r }}?</span>
      </div>
    </template>

    <!-- Every popular hashtag, still no views -->
    <template v-else-if="kind === 'hashtags'">
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-64 max-w-full rounded-lg border border-default bg-default p-3 shadow-sm">
          <div class="space-y-1.5">
            <div class="h-1.5 w-11/12 rounded-full bg-accented" />
            <div class="h-1.5 w-2/3 rounded-full bg-accented" />
          </div>
          <p class="mt-2 text-[11px] leading-snug text-sky-700 dark:text-sky-400">
            #fyp #viral #foryou #fypシ #trending #fypage #viralvideo #xyzbca #masukberanda #fyp2026
          </p>
          <div class="mt-2.5 flex items-center gap-3 border-t border-default pt-2 text-[11px] text-dimmed">
            <span class="inline-flex items-center gap-1"><UIcon
              name="i-lucide-eye"
              class="size-3.5"
            />{{ t('landing.art.tags.views') }}</span>
            <span class="inline-flex items-center gap-1"><UIcon
              name="i-lucide-heart"
              class="size-3.5"
            />0</span>
          </div>
        </div>
      </div>
      <span class="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold art-warn">
        <UIcon
          name="i-lucide-circle-help"
          class="size-3"
        />
        {{ t('landing.art.tags.ask') }}
      </span>
    </template>

    <!-- A long, ugly affiliate link and no idea who clicked it -->
    <template v-else-if="kind === 'links'">
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-64 max-w-full rounded-lg border border-default bg-default p-3 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="size-5 rounded-full bg-primary/25" />
            <div class="h-1.5 w-16 rounded-full bg-accented" />
          </div>
          <p class="mt-2 font-mono text-[10px] leading-snug break-all text-muted">
            https://shopee.co.id/Tas-Selempang-Wanita-Kulit-Premium-i.123456789.987654321?sp_atk=a1b2c3d4-e5f6-7a8b&amp;xptdk=0a9b8c7d-6e5f
          </p>
          <div class="mt-2.5 flex items-end gap-1 border-t border-default pt-2">
            <span
              v-for="i in 5"
              :key="i"
              class="h-5 w-3 rounded-sm border border-dashed border-accented"
            />
            <span class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium art-warn">
              <UIcon
                name="i-lucide-circle-help"
                class="size-3.5"
              />
              {{ t('landing.art.link.ask') }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Many products, room for one link in the bio -->
    <template v-else-if="kind === 'etalase'">
      <div class="absolute inset-0 flex items-center justify-center gap-3 p-4">
        <div class="w-36 shrink-0 rounded-lg border border-default bg-default p-3 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="size-8 rounded-full bg-primary/25" />
            <div class="flex-1 space-y-1">
              <div class="h-1.5 w-full rounded-full bg-accented" />
              <div class="h-1.5 w-2/3 rounded-full bg-accented" />
            </div>
          </div>
          <div class="mt-2.5 space-y-1">
            <div class="h-1.5 w-full rounded-full bg-muted" />
            <div class="h-1.5 w-4/5 rounded-full bg-muted" />
          </div>
          <p class="mt-2 truncate rounded-md bg-elevated px-1.5 py-1 font-mono text-[10px] text-sky-700 dark:text-sky-400">
            shopee.co.id/tas-k…
          </p>
          <p class="mt-1.5 text-[10px] font-semibold art-warn">
            {{ t('landing.art.bio.only') }}
          </p>
        </div>
        <div class="relative h-28 w-20 shrink-0">
          <LandingArtPhoto
            v-for="(icon, i) in ['i-lucide-shirt', 'i-lucide-watch', 'i-lucide-footprints']"
            :key="icon"
            :icon="icon"
            :tone="i + 1"
            icon-class="size-6"
            class="absolute size-14 rounded-md border-2 border-default shadow-sm"
            :class="['top-0 left-0 -rotate-6', 'top-7 left-5 rotate-3', 'top-14 left-1 -rotate-2'][i]"
          />
          <span class="absolute -right-2 -bottom-2 rounded-full bg-inverted px-1.5 py-0.5 text-[10px] font-semibold text-inverted">
            {{ t('landing.art.bio.more') }}
          </span>
        </div>
      </div>
    </template>

    <!-- "Mau kak" piling up while you're away -->
    <template v-else>
      <div class="absolute inset-0 flex flex-col justify-center gap-1.5 px-5">
        <div
          v-for="(c, i) in COMMENTS"
          :key="c.key"
          class="flex items-center gap-2"
          :class="[c.offset, i > 1 && 'opacity-70', i > 2 && 'opacity-45']"
        >
          <span
            class="size-5 shrink-0 rounded-full"
            :class="AVATARS[c.tone]"
          />
          <span class="rounded-2xl rounded-tl-sm border border-default bg-default px-2.5 py-1 text-[11px] text-default shadow-sm">
            {{ t(`landing.art.comments.${c.key}`) }}
          </span>
        </div>
      </div>
      <span class="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
        <UIcon
          name="i-lucide-message-circle"
          class="size-3"
        />
        {{ t('landing.art.comments.unread') }}
      </span>
      <span class="absolute right-3 bottom-3 inline-flex items-center gap-1 text-[11px] text-dimmed">
        <UIcon
          name="i-lucide-clock"
          class="size-3"
        />
        {{ t('landing.art.comments.ago') }}
      </span>
    </template>
  </div>
</template>
