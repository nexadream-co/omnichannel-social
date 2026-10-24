<script setup lang="ts">
/** A grey sample chart for an empty Statistik: shows what will appear here, clearly labelled "contoh". */
const { t } = useI18n()
const SAMPLE = [18, 34, 26, 48, 40, 72, 58, 44, 66, 90, 62, 78, 52, 96]
</script>

<template>
  <div
    class="relative"
    aria-hidden="true"
  >
    <div class="flex items-end gap-0.5 h-32 opacity-60">
      <div
        v-for="(h, i) in SAMPLE"
        :key="i"
        class="flex-1 min-w-0 rounded-t-sm bg-accented"
        :style="{ height: `${h}%` }"
      />
    </div>
    <span class="absolute top-0 right-0 rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">{{ t('analytics.sample') }}</span>
  </div>
</template>
