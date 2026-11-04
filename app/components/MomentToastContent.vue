<script setup lang="ts">
import type { MomentScene } from '~/utils/moments'

/** The inside of a moment toast (useMoments): the animated scene, a headline that pops in, and optional count-up chips. */
export interface MomentStat { icon: string, value: number, label: string }

const props = defineProps<{ momentId: string, scene: MomentScene, platformIcon?: string, title: string, body?: string, stats?: MomentStat[] }>()
const { locale } = useI18n()
const format = (n: number) => new Intl.NumberFormat(locale.value).format(n)

// The chips count up from zero once the toast is on screen.
const shown = ref<number[]>((props.stats ?? []).map(() => 0))
onMounted(() => {
  requestAnimationFrame(() => {
    shown.value = (props.stats ?? []).map(stat => stat.value)
  })
})
</script>

<template>
  <span
    class="flex items-start gap-3"
    :data-moment-id="momentId"
  >
    <MomentScene
      :scene="scene"
      :platform-icon="platformIcon"
    />
    <span class="min-w-0 flex-1 pt-0.5">
      <span class="moment-line block text-[0.95rem] font-semibold leading-snug text-highlighted">{{ title }}</span>
      <span
        v-if="body"
        class="moment-line moment-line-2 mt-0.5 block text-sm font-normal text-muted"
      >{{ body }}</span>
      <span
        v-if="stats?.length"
        class="moment-line moment-line-2 mt-2 flex flex-wrap gap-1.5"
      >
        <span
          v-for="(stat, index) in stats"
          :key="stat.label"
          class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          <UIcon
            :name="stat.icon"
            class="size-3.5"
          />
          <TickNumber
            :value="shown[index] ?? 0"
            :format="format"
            :duration="900"
          />
          <span>{{ stat.label }}</span>
        </span>
      </span>
    </span>
  </span>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .moment-line { animation: line-in 420ms cubic-bezier(.3, 1.3, .5, 1) 180ms both; }
  .moment-line-2 { animation-delay: 300ms; }
}
@keyframes line-in { from { transform: translateY(0.4rem); opacity: 0; } }
</style>
