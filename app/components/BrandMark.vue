<script setup lang="ts">
/**
 * The Socialz.id app icon (a shopping bag that is also a chat bubble) as inline SVG, so it needs no request and no
 * client JS (the public Etalase ships none). Size it with a class. Hovering it, or a `.group` ancestor such as the link
 * around it, tilts the bag and pops a sparkle (the `.brand-mark` rules in main.css). Decorative: label the link instead.
 */
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    class="brand-mark shrink-0"
    aria-hidden="true"
  >
    <rect
      width="64"
      height="64"
      rx="14"
      fill="#e6114f"
    />
    <g class="brand-mark-bag">
      <path
        d="M24.5 23.5V20a7.5 7.5 0 0 1 15 0v3.5"
        fill="none"
        stroke="#fff"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <path
        d="M18.6 21.5h26.8c1.6 0 3 1.2 3.2 2.8l2.2 19.6a6 6 0 0 1-6 6.6H27.5l-8.2 6.2c-.8.6-1.9-.1-1.6-1.1l1.4-5.6c-3-.6-5.2-3.4-4.8-6.5l2.2-19.2c.2-1.6 1.6-2.8 3.1-2.8z"
        fill="#fff"
      />
      <circle
        cx="24.5"
        cy="27"
        r="1.7"
        fill="#e6114f"
      />
      <circle
        cx="39.5"
        cy="27"
        r="1.7"
        fill="#e6114f"
      />
      <path
        d="M32 45c-4.8-3.1-7.4-5.6-7.4-8.4 0-2.1 1.6-3.7 3.7-3.7 1.6 0 2.9.8 3.7 2.1.8-1.3 2.1-2.1 3.7-2.1 2.1 0 3.7 1.6 3.7 3.7 0 2.8-2.6 5.3-7.4 8.4z"
        fill="#e6114f"
      />
    </g>
    <path
      class="brand-mark-spark"
      d="M50.5 7.5q1.2 4.8 6 6-4.8 1.2-6 6-1.2-4.8-6-6 4.8-1.2 6-6z"
      fill="#ffc6d2"
    />
  </svg>
</template>
