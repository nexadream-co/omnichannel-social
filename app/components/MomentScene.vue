<script setup lang="ts">
import type { MomentScene } from '~/utils/moments'

/**
 * The animated picture in a moment toast: one short story per moment (a plane lands on the calendar, a shop
 * shutter rolls up, a comment gets a DM back). Every element rests in its final frame, and the motion only plays
 * when the device welcomes it, so reduced motion shows a still badge.
 */
defineProps<{ scene: MomentScene, platformIcon?: string }>()
</script>

<template>
  <span
    class="scene"
    aria-hidden="true"
  >
    <span class="shine" />

    <template v-if="scene === 'welcome'">
      <UIcon
        name="i-lucide-party-popper"
        class="main pop-tilt"
      />
      <span class="dot d1" /><span class="dot d2" /><span class="dot d3" /><span class="dot d4" />
    </template>

    <template v-else-if="scene === 'verified'">
      <span class="ripple dl-1" />
      <UIcon
        name="i-lucide-badge-check"
        class="main stamp"
      />
    </template>

    <template v-else-if="scene === 'connect'">
      <UIcon
        :name="platformIcon || 'i-lucide-at-sign'"
        class="main slide-in"
      />
      <span class="badge dl-2"><UIcon name="i-lucide-link-2" /></span>
    </template>

    <template v-else-if="scene === 'schedule'">
      <UIcon
        name="i-lucide-calendar"
        class="main"
      />
      <UIcon
        name="i-lucide-send"
        class="plane"
      />
      <span class="badge dl-3"><UIcon name="i-lucide-check" /></span>
    </template>

    <template v-else-if="scene === 'launch'">
      <span class="trail t1" /><span class="trail t2" />
      <UIcon
        name="i-lucide-rocket"
        class="main rocket"
      />
    </template>

    <template v-else-if="scene === 'publish'">
      <UIcon
        name="i-lucide-smartphone"
        class="main rise"
      />
      <UIcon
        name="i-lucide-heart"
        class="heart-float"
      />
      <span class="badge dl-2"><UIcon name="i-lucide-heart" /></span>
    </template>

    <template v-else-if="scene === 'etalase'">
      <UIcon
        name="i-lucide-store"
        class="main"
      />
      <span class="shutter" />
      <UIcon
        name="i-lucide-sparkles"
        class="corner-spark dl-3"
      />
    </template>

    <template v-else-if="scene === 'autoreply'">
      <UIcon
        name="i-lucide-message-circle"
        class="bubble-in"
      />
      <UIcon
        name="i-lucide-message-circle-reply"
        class="bubble-out dl-2"
      />
      <span class="badge dl-3"><UIcon name="i-lucide-zap" /></span>
    </template>

    <template v-else-if="scene === 'link'">
      <UIcon
        name="i-lucide-tag"
        class="main swing"
      />
      <span class="badge dl-2"><UIcon name="i-lucide-link" /></span>
    </template>

    <template v-else-if="scene === 'click'">
      <span class="ripple dl-2" />
      <UIcon
        name="i-lucide-mouse-pointer-click"
        class="main tap"
      />
    </template>

    <template v-else-if="scene === 'dm'">
      <UIcon
        name="i-lucide-send"
        class="plane"
      />
      <UIcon
        name="i-lucide-mail-check"
        class="main pop dl-2"
      />
    </template>

    <template v-else-if="scene === 'trophy'">
      <UIcon
        name="i-lucide-trophy"
        class="main rise"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s1 dl-2"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s2 dl-3"
      />
    </template>

    <template v-else-if="scene === 'upgrade'">
      <UIcon
        name="i-lucide-crown"
        class="main drop"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s1 dl-2"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s2 dl-3"
      />
    </template>

    <template v-else-if="scene === 'checklist'">
      <svg
        class="ring"
        viewBox="0 0 56 56"
      >
        <circle
          cx="28"
          cy="28"
          r="23"
          pathLength="100"
        />
      </svg>
      <UIcon
        name="i-lucide-list-checks"
        class="main pop dl-2"
      />
    </template>

    <template v-else-if="scene === 'target'">
      <UIcon
        name="i-lucide-target"
        class="main"
      />
      <span class="arrow" />
    </template>

    <template v-else-if="scene === 'sun'">
      <UIcon
        name="i-lucide-sun"
        class="main sun"
      />
    </template>

    <template v-else-if="scene === 'moon'">
      <UIcon
        name="i-lucide-moon"
        class="main rise"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s1 dl-1"
      />
      <UIcon
        name="i-lucide-sparkle"
        class="star s2 dl-2"
      />
    </template>
  </span>
</template>

<style scoped>
/* Resting frame: what reduced motion shows, and where every animation ends. */
.scene {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 1rem;
  color: #fff;
  background: linear-gradient(135deg, #c20842 0%, #e6114f 40%, #f93466 70%, #ff7a45 100%);
  box-shadow: 0 6px 16px -6px color-mix(in srgb, #e6114f 70%, transparent);
}
.scene > * { grid-area: 1 / 1; }
.main { width: 1.75rem; height: 1.75rem; }

.badge {
  position: absolute;
  right: 0.3rem;
  bottom: 0.3rem;
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 9999px;
  background: #fff;
  color: #e6114f;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}
.badge > * { width: 0.7rem; height: 0.7rem; }

.star { position: absolute; width: 0.8rem; height: 0.8rem; color: #ffe08a; }
.s1 { top: 0.35rem; right: 0.4rem; }
.s2 { bottom: 0.5rem; left: 0.4rem; width: 0.6rem; height: 0.6rem; }
.corner-spark { position: absolute; top: 0.3rem; right: 0.3rem; width: 0.85rem; height: 0.85rem; color: #ffe08a; }

.bubble-in { position: absolute; top: 0.55rem; left: 0.5rem; width: 1.2rem; height: 1.2rem; opacity: 0.85; }
.bubble-out { position: absolute; right: 0.45rem; bottom: 0.5rem; width: 1.55rem; height: 1.55rem; }
.bubble-out ~ .badge { top: 0.3rem; right: 0.3rem; bottom: auto; }

.ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: #ffe08a; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 0; }

.arrow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1.3rem;
  height: 0.18rem;
  margin: -0.09rem 0 0 -0.1rem;
  border-radius: 9999px;
  background: #ffe08a;
  transform: rotate(-45deg);
  transform-origin: 0 50%;
}

/* Decorations that only exist in motion. */
.shine, .dot, .ripple, .plane, .trail, .heart-float, .shutter { opacity: 0; }
.shine {
  position: absolute;
  inset: -50%;
  background: linear-gradient(115deg, transparent 40%, rgb(255 255 255 / 0.55) 50%, transparent 60%);
  pointer-events: none;
}
.dot { position: absolute; width: 0.35rem; height: 0.35rem; border-radius: 9999px; background: #ffe08a; }
.d2, .d4 { background: #fff; border-radius: 1px; }
.ripple { position: absolute; width: 2.4rem; height: 2.4rem; border: 2px solid #fff; border-radius: 9999px; }
.plane { position: absolute; width: 1.1rem; height: 1.1rem; }
.trail { position: absolute; bottom: 0.4rem; width: 0.3rem; height: 0.3rem; border-radius: 9999px; background: #ffe08a; }
.t1 { left: 1.45rem; }
.t2 { left: 1.8rem; }
.heart-float { position: absolute; width: 0.9rem; height: 0.9rem; color: #fff; }
.shutter {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(180deg, #c20842 0 5px, #a20a3e 5px 7px);
}

@media (prefers-reduced-motion: no-preference) {
  .scene { animation: scene-in 520ms cubic-bezier(.3, 1.5, .5, 1) both; }
  .shine { animation: shine 900ms ease-out 450ms both; }
  .dl-1 { animation-delay: 180ms !important; }
  .dl-2 { animation-delay: 380ms !important; }
  .dl-3 { animation-delay: 620ms !important; }

  .badge { animation: pop 420ms cubic-bezier(.3, 1.8, .5, 1) 380ms both; }
  .pop { animation: pop 460ms cubic-bezier(.3, 1.6, .5, 1) both; }
  .pop-tilt { animation: pop-tilt 600ms cubic-bezier(.3, 1.6, .5, 1) 120ms both; }
  .stamp { animation: stamp 420ms cubic-bezier(.2, .9, .3, 1.3) 80ms both; }
  .slide-in { animation: slide-in 620ms cubic-bezier(.3, 1.4, .5, 1) 80ms both; }
  .rise { animation: rise 560ms cubic-bezier(.3, 1.4, .5, 1) 80ms both; }
  .drop { animation: drop 640ms cubic-bezier(.3, 1.5, .5, 1) 80ms both; }
  .swing { transform-origin: 50% 0; animation: swing 900ms ease-out 80ms both; }
  .tap { animation: tap 760ms ease-out 80ms both; }
  .sun { animation: sun 1200ms cubic-bezier(.3, 1.2, .5, 1) 80ms both; }
  .rocket { animation: rocket 900ms cubic-bezier(.3, 1.3, .5, 1) 80ms both; }
  .star { animation: twinkle 700ms ease-out both; }
  .corner-spark { animation: twinkle 700ms ease-out both; }
  .bubble-in { animation: pop 420ms cubic-bezier(.3, 1.6, .5, 1) 80ms both; }
  .bubble-out { animation: bubble-out 520ms cubic-bezier(.3, 1.6, .5, 1) both; }
  .ring circle { animation: ring-draw 900ms ease-out 120ms both; }
  .arrow { animation: arrow-in 520ms cubic-bezier(.2, .9, .3, 1.2) 200ms both; }
  .main:has(+ .arrow) { animation: target-hit 500ms ease-out 640ms both; }

  .dot { animation: dot-fly 900ms cubic-bezier(.2, .7, .3, 1) 380ms both; }
  .d1 { --to: translate(-1.3rem, -1.2rem); }
  .d2 { --to: translate(1.3rem, -1.1rem); }
  .d3 { --to: translate(-1.2rem, 1.2rem); }
  .d4 { --to: translate(1.25rem, 1.15rem); }
  .ripple { animation: ripple 800ms ease-out both; }
  .plane { animation: plane 760ms cubic-bezier(.4, 0, .3, 1) 120ms both; }
  .trail { animation: trail 700ms ease-out 260ms both; }
  .t2 { animation-delay: 380ms; }
  .heart-float { animation: heart-float 1100ms ease-out 520ms both; }
  .shutter { animation: shutter 760ms cubic-bezier(.6, 0, .3, 1) 260ms both; }
}

@keyframes scene-in { from { transform: scale(0.4) rotate(-12deg); opacity: 0; } }
@keyframes shine {
  from { transform: translateX(-60%); opacity: 1; }
  to { transform: translateX(60%); opacity: 0; }
}
@keyframes pop {
  0% { transform: scale(0); opacity: 0; }
  60% { opacity: 1; }
}
@keyframes pop-tilt { from { transform: scale(0) rotate(-40deg); opacity: 0; } }
@keyframes stamp { from { transform: scale(2.4); opacity: 0; } }
@keyframes slide-in {
  0% { transform: translateX(-2.4rem) rotate(-20deg); opacity: 0; }
  70% { transform: translateX(0.2rem) rotate(4deg); opacity: 1; }
}
@keyframes rise { from { transform: translateY(1.6rem); opacity: 0; } }
@keyframes drop {
  0% { transform: translateY(-2rem) rotate(-15deg); opacity: 0; }
  65% { transform: translateY(0.15rem) rotate(6deg); opacity: 1; }
}
@keyframes swing {
  0% { transform: translateY(-1.8rem) rotate(-45deg); opacity: 0; }
  35% { transform: translateY(0) rotate(25deg); opacity: 1; }
  60% { transform: rotate(-12deg); }
  80% { transform: rotate(5deg); }
}
@keyframes tap {
  0% { transform: translate(1rem, 1rem); opacity: 0; }
  45% { transform: translate(0, 0); opacity: 1; }
  60% { transform: scale(0.82); }
  75% { transform: scale(1.06); }
}
@keyframes sun {
  0% { transform: translateY(1.4rem) rotate(-90deg) scale(0.6); opacity: 0; }
  70% { transform: translateY(-0.1rem) rotate(10deg) scale(1.05); opacity: 1; }
}
@keyframes rocket {
  0% { transform: translate(-0.8rem, 1.8rem); opacity: 0; }
  40% { transform: translate(0.1rem, -0.1rem); opacity: 1; }
  50% { transform: translate(-0.08rem, 0.05rem); }
  60% { transform: translate(0.08rem, -0.05rem); }
  70% { transform: translate(-0.05rem, 0); }
}
@keyframes twinkle {
  0% { transform: scale(0) rotate(-90deg); opacity: 0; }
  60% { transform: scale(1.4) rotate(15deg); opacity: 1; }
}
@keyframes bubble-out {
  0% { transform: translate(-0.8rem, -0.6rem) scale(0); opacity: 0; }
  70% { transform: scale(1.12); opacity: 1; }
}
@keyframes ring-draw { from { stroke-dashoffset: 100; } }
@keyframes arrow-in {
  0% { transform: translate(1.6rem, -1.6rem) rotate(-45deg); opacity: 0; }
  80% { transform: translate(-0.1rem, 0.1rem) rotate(-45deg); opacity: 1; }
}
@keyframes target-hit {
  30% { transform: scale(0.88); }
  60% { transform: scale(1.08); }
}
@keyframes dot-fly {
  0% { transform: translate(0, 0) scale(0.4); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: var(--to) scale(1); opacity: 0; }
}
@keyframes ripple {
  0% { transform: scale(0.3); opacity: 0.9; }
  100% { transform: scale(1.5); opacity: 0; }
}
@keyframes plane {
  0% { transform: translate(-1.6rem, 1.2rem) rotate(0deg) scale(0.7); opacity: 0; }
  20% { opacity: 1; }
  75% { transform: translate(0.2rem, -0.2rem) scale(1); opacity: 1; }
  100% { transform: translate(0.5rem, -0.5rem) scale(0.3); opacity: 0; }
}
@keyframes trail {
  0% { transform: translateY(-0.6rem) scale(1); opacity: 1; }
  100% { transform: translateY(0.6rem) scale(0.2); opacity: 0; }
}
@keyframes heart-float {
  0% { transform: translateY(0.3rem) scale(0.4); opacity: 0; }
  25% { transform: translateY(-0.2rem) scale(1.1); opacity: 1; }
  100% { transform: translateY(-1.8rem) scale(0.8); opacity: 0; }
}
@keyframes shutter {
  0% { transform: translateY(0); opacity: 1; }
  99% { transform: translateY(-100%); opacity: 1; }
  100% { transform: translateY(-100%); opacity: 0; }
}
</style>
