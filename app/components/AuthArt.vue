<script setup lang="ts">
/** A small brand picture above the sign-in card: a post that is scheduled and a comment that gets answered. Decorative. */
const { t } = useI18n()
</script>

<template>
  <div
    class="relative mx-auto mb-5 hidden h-24 w-56 [@media(min-height:600px)]:block"
    aria-hidden="true"
  >
    <div class="absolute inset-x-6 inset-y-2 rounded-full bg-primary/15 blur-2xl" />
    <div class="art-float absolute top-0 left-0 flex items-center gap-2 rounded-xl border border-default bg-default p-2 shadow-lg">
      <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 art-ink">
        <UIcon
          name="i-lucide-calendar-clock"
          class="size-4"
        />
      </span>
      <span class="pr-1 text-[11px] font-semibold text-highlighted">{{ t('landing.art.hero.scheduled') }}</span>
      <UIcon
        name="i-lucide-circle-check"
        class="size-3.5 art-ok"
      />
    </div>
    <div
      class="art-float absolute right-0 bottom-0 rounded-xl border border-default bg-default p-2 shadow-lg"
      style="animation-delay: -3s"
    >
      <div class="flex items-center gap-1.5">
        <span class="size-4 shrink-0 rounded-full bg-sky-300" />
        <span class="rounded-xl rounded-tl-sm bg-elevated px-2 py-0.5 text-[10px] text-default">{{ t('landing.art.hero.comment') }}</span>
      </div>
      <p class="mt-1 flex items-center gap-1 text-[10px] font-semibold art-ok">
        <UIcon
          name="i-lucide-check-check"
          class="size-3.5 shrink-0"
        />
        {{ t('landing.art.hero.sent') }}
      </p>
    </div>
  </div>
</template>
