<script setup lang="ts">
import type { StatusMeta } from '#shared/utils/status'

const props = defineProps<{ value: string, meta: Record<string, StatusMeta>, plain?: boolean }>()
const { t, te } = useI18n()
const entry = computed(() => props.meta[props.value])
// A raw enum slug never reaches the screen: unknown values show a neutral dash.
const label = computed(() => entry.value && te(entry.value.labelKey) ? t(entry.value.labelKey) : '—')
</script>

<template>
  <UBadge
    :color="entry?.color ?? 'neutral'"
    variant="subtle"
    :label="label"
  />
</template>
