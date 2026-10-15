<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

const items = computed(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  type: 'checkbox' as const,
  checked: entry.code === locale.value,
  onSelect: () => setLocale(entry.code)
})))
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      icon="i-lucide-languages"
      color="neutral"
      variant="ghost"
      :label="locale.toUpperCase()"
      :aria-label="$t('nav.language')"
    />
  </UDropdownMenu>
</template>
