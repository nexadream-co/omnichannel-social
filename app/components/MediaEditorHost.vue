<script setup lang="ts">
/** Mounted once in CreatorShell. The editor (and Konva) load only when someone opens it. */
const { state, settle } = useMediaEditor()
</script>

<template>
  <LazyMediaEditor
    v-if="state.open && state.request"
    :key="state.request.mediaId"
    :request="state.request"
    @done="settle"
  />
</template>
