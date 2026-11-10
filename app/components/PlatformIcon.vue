<script setup lang="ts">
import type { BrandKey } from '~/utils/brand'

/** A platform's logo in its original colours (no badge around it). Size comes from the caller's class. */
defineProps<{ platform: BrandKey }>()
</script>

<template>
  <UIcon
    :name="brandIcon(platform)"
    :class="brandIconClass(platform)"
  />
</template>
