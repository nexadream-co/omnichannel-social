<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

withDefaults(defineProps<{ title?: string, description?: string, dismissible?: boolean }>(), { dismissible: true })
const open = defineModel<boolean>('open', { default: false })
// SSR-safe: false on the server, so the phone sheet is the default until the client knows better.
const desktop = useMediaQuery('(min-width: 1024px)')
</script>

<template>
  <UModal
    v-if="desktop"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
  >
    <template #body>
      <slot name="body" />
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </UModal>
  <UDrawer
    v-else
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    handle
  >
    <template #body>
      <slot name="body" />
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </UDrawer>
</template>
