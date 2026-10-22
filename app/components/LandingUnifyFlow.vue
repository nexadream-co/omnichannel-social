<script setup lang="ts">
/**
 * Landing hero diagram: the separate tools a creator juggles flow into Socialz.id, which publishes
 * everywhere. Nodes are HTML placed on the same coordinates as the SVG lines (the box keeps the
 * viewBox ratio), so it stays sharp at any width. Wide layout from lg, stacked layout below.
 */
const { t } = useI18n()

const TOOLS = [
  { key: 'post', icon: 'i-lucide-smartphone' },
  { key: 'alarm', icon: 'i-lucide-alarm-clock' },
  { key: 'bio', icon: 'i-lucide-link-2' },
  { key: 'shortener', icon: 'i-lucide-scissors' },
  { key: 'dm', icon: 'i-lucide-message-circle' },
  { key: 'hashtag', icon: 'i-lucide-hash' }
]
const HUB = [
  { key: 'schedule', icon: 'i-lucide-calendar-clock' },
  { key: 'links', icon: 'i-lucide-chart-column' },
  { key: 'etalase', icon: 'i-lucide-store' },
  { key: 'reply', icon: 'i-lucide-message-circle-reply' }
]
const OUTPUTS = [
  { name: 'Instagram', icon: 'i-simple-icons-instagram' },
  { name: 'Threads', icon: 'i-simple-icons-threads' },
  { name: 'Facebook', icon: 'i-simple-icons-facebook' }
]

interface Point { x: number, y: number }
interface Layout {
  key: 'wide' | 'tall'
  w: number
  h: number
  tool: { w: number, h: number, at: Point[] }
  hub: Point & { w: number, h: number }
  out: { w: number, h: number, at: Point[] }
  captions: (Point & { key: string })[]
  toolPath: (from: Point, i: number) => string
  outPath: (to: Point, i: number) => string
}

const wideHub = { x: 500, y: 245, w: 250, h: 230 }
const tallHub = { x: 180, y: 370, w: 250, h: 190 }
const LAYOUTS: Layout[] = [
  {
    key: 'wide',
    w: 1000,
    h: 460,
    // Slightly uneven on purpose: the old way is scattered.
    tool: { w: 210, h: 50, at: [135, 110, 145, 115, 140, 105].map((x, i) => ({ x, y: 70 + i * 70 })) },
    hub: wideHub,
    out: { w: 180, h: 50, at: [165, 245, 325].map(y => ({ x: 880, y })) },
    captions: [{ key: 'before', x: 125, y: 22 }, { key: 'hub', x: 500, y: 110 }, { key: 'after', x: 880, y: 120 }],
    toolPath: (p, i) => {
      const sx = p.x + 105
      const ex = wideHub.x - wideHub.w / 2
      const ey = wideHub.y + (i - 2.5) * 24
      return `M${sx} ${p.y} C${sx + 90} ${p.y}, ${ex - 90} ${ey}, ${ex} ${ey}`
    },
    outPath: (p, i) => {
      const sx = wideHub.x + wideHub.w / 2
      const sy = wideHub.y + (i - 1) * 30
      const ex = p.x - 90
      return `M${sx} ${sy} C${sx + 80} ${sy}, ${ex - 80} ${p.y}, ${ex} ${p.y}`
    }
  },
  {
    key: 'tall',
    w: 360,
    h: 730,
    tool: { w: 110, h: 60, at: [0, 1, 2, 3, 4, 5].map(i => ({ x: [62, 180, 298][i % 3]!, y: i < 3 ? 70 : 142 })) },
    hub: tallHub,
    out: { w: 104, h: 56, at: [62, 180, 298].map(x => ({ x, y: 640 })) },
    captions: [{ key: 'before', x: 180, y: 16 }, { key: 'after', x: 180, y: 708 }],
    // Each column runs straight down (behind the row below), so the lines never cross.
    toolPath: (p, i) => {
      const sy = p.y + 30
      const ex = tallHub.x + ((i % 3) - 1) * 60 + (i < 3 ? -10 : 10)
      const ey = tallHub.y - tallHub.h / 2
      return `M${p.x} ${sy} C${p.x} ${sy + 60}, ${ex} ${ey - 60}, ${ex} ${ey}`
    },
    outPath: (p, i) => {
      const sx = tallHub.x + (i - 1) * 40
      const sy = tallHub.y + tallHub.h / 2
      const ey = p.y - 28
      return `M${sx} ${sy} C${sx} ${sy + 50}, ${p.x} ${ey - 50}, ${p.x} ${ey}`
    }
  }
]

const pct = (value: number, total: number) => `${(value / total) * 100}%`
const box = (l: Layout, c: Point, w: number, h: number) => ({ left: pct(c.x - w / 2, l.w), top: pct(c.y - h / 2, l.h), width: pct(w, l.w), height: pct(h, l.h) })
const at = (l: Layout, c: Point) => ({ left: pct(c.x, l.w), top: pct(c.y, l.h) })
</script>

<template>
  <figure>
    <figcaption class="sr-only">
      {{ t('landing.flow.alt') }}
    </figcaption>
    <div
      v-for="l in LAYOUTS"
      :key="l.key"
      class="relative mx-auto"
      :class="l.key === 'wide' ? 'hidden lg:block w-full max-w-5xl' : 'lg:hidden w-full max-w-sm md:max-w-md'"
      :style="{ aspectRatio: `${l.w} / ${l.h}` }"
      aria-hidden="true"
    >
      <svg
        :viewBox="`0 0 ${l.w} ${l.h}`"
        class="absolute inset-0 size-full"
        fill="none"
      >
        <g
          v-for="(p, i) in l.tool.at"
          :key="`t${i}`"
        >
          <path
            :d="l.toolPath(p, i)"
            class="text-(--ui-border-accented)"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            :d="l.toolPath(p, i)"
            class="unify-flow text-dimmed"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="0 10"
            :style="{ animationDelay: `${-i * 0.17}s` }"
          />
        </g>
        <g
          v-for="(p, i) in l.out.at"
          :key="`o${i}`"
        >
          <path
            :d="l.outPath(p, i)"
            class="text-primary/30"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            :d="l.outPath(p, i)"
            class="unify-flow text-primary"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="0 10"
            :style="{ animationDelay: `${-i * 0.3}s` }"
          />
        </g>
      </svg>

      <p
        v-for="c in l.captions"
        :key="c.key"
        class="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium uppercase tracking-wide"
        :class="c.key === 'before' ? 'text-muted' : 'text-primary'"
        :style="at(l, c)"
      >
        {{ t(`landing.flow.caption.${c.key}`) }}
      </p>

      <!-- The old way: one tool per job -->
      <div
        v-for="(tool, i) in TOOLS"
        :key="tool.key"
        class="absolute flex items-center rounded-lg border border-dashed border-accented bg-default text-muted"
        :class="l.key === 'wide' ? 'gap-2.5 px-3' : 'flex-col justify-center gap-1 px-1 text-center'"
        :style="box(l, l.tool.at[i]!, l.tool.w, l.tool.h)"
      >
        <UIcon
          :name="tool.icon"
          class="size-4 shrink-0"
        />
        <span
          class="leading-tight"
          :class="l.key === 'wide' ? 'text-sm' : 'text-[11px]'"
        >{{ t(`landing.flow.tools.${tool.key}`) }}</span>
      </div>

      <!-- Socialz.id: the same jobs in one place -->
      <div
        class="absolute"
        :style="box(l, l.hub, l.hub.w, l.hub.h)"
      >
        <div class="unify-pulse absolute inset-0 rounded-2xl border-2 border-primary" />
        <div class="relative size-full rounded-2xl border-2 border-primary bg-default p-3 flex flex-col shadow-lg shadow-primary/10">
          <p class="text-center font-bold text-primary">
            Socialz.id
          </p>
          <ul class="mt-2 grid flex-1 grid-cols-2 gap-2">
            <li
              v-for="item in HUB"
              :key="item.key"
              class="flex flex-col items-center justify-center gap-1 rounded-lg bg-primary/10 px-1 text-center"
            >
              <UIcon
                :name="item.icon"
                class="size-5 text-primary"
              />
              <span class="text-xs font-medium leading-tight text-highlighted">{{ t(`landing.flow.hub.${item.key}`) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Published everywhere, by itself -->
      <div
        v-for="(o, i) in OUTPUTS"
        :key="o.name"
        class="absolute flex items-center rounded-lg border border-default bg-default text-highlighted shadow-sm"
        :class="l.key === 'wide' ? 'gap-2.5 px-3' : 'flex-col justify-center gap-1'"
        :style="box(l, l.out.at[i]!, l.out.w, l.out.h)"
      >
        <UIcon
          :name="o.icon"
          class="size-5 shrink-0"
        />
        <span :class="l.key === 'wide' ? 'text-sm font-medium' : 'text-[11px] font-medium'">{{ o.name }}</span>
        <UIcon
          v-if="l.key === 'wide'"
          name="i-lucide-circle-check"
          class="ml-auto size-4 text-success"
        />
      </div>
    </div>
  </figure>
</template>
