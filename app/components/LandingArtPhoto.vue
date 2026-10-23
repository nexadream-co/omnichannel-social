<script setup lang="ts">
/** A stand-in product photo for the landing illustrations: a soft gradient with a product icon. */
const props = withDefaults(defineProps<{ icon?: string, tone?: number, iconClass?: string }>(), { icon: 'i-lucide-shirt', tone: 0, iconClass: 'size-10' })

const TONES = [
  'from-amber-100 to-rose-200 text-rose-500/70 dark:from-amber-300/25 dark:to-rose-400/30 dark:text-rose-200/80',
  'from-sky-100 to-indigo-200 text-indigo-500/70 dark:from-sky-300/25 dark:to-indigo-400/30 dark:text-indigo-200/80',
  'from-emerald-100 to-teal-200 text-teal-600/70 dark:from-emerald-300/25 dark:to-teal-400/30 dark:text-teal-200/80',
  'from-violet-100 to-fuchsia-200 text-fuchsia-500/70 dark:from-violet-300/25 dark:to-fuchsia-400/30 dark:text-fuchsia-200/80'
]
</script>

<template>
  <div
    class="flex items-center justify-center overflow-hidden bg-linear-to-br"
    :class="TONES[props.tone % TONES.length]"
  >
    <UIcon
      :name="props.icon"
      :class="props.iconClass"
    />
  </div>
</template>
