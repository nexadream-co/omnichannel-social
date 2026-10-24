<script setup lang="ts">
import type { Merchant } from '#shared/utils/links'

/**
 * A product photo the creator taps to add or replace. Without a photo it reads "Foto" with a camera, so the
 * empty spot asks for one. Emits the chosen file; the parent uploads it and sets `busy` meanwhile.
 */
defineProps<{ src: string | null, title?: string | null, merchant?: Merchant | null, busy?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ pick: [file: File] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement>()

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) emit('pick', file)
}
</script>

<template>
  <button
    type="button"
    class="relative shrink-0 overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
    :disabled="disabled || busy"
    :aria-label="src ? t('links.changePhoto') : t('links.addPhoto')"
    @click="input?.click()"
  >
    <SmartImage
      v-if="src"
      :src="src"
      :title="title"
      :merchant="merchant"
      kind="product"
      class="size-full"
    />
    <span
      v-else
      class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-accented bg-elevated/50 text-muted hover:text-primary hover:border-primary"
    >
      <UIcon
        name="i-lucide-camera"
        class="size-5"
      />
      <span class="text-[11px] font-medium leading-none">{{ t('links.photo') }}</span>
    </span>
    <span
      v-if="busy"
      class="absolute inset-0 grid place-items-center bg-default/70"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 text-primary motion-safe:animate-spin"
      />
    </span>
    <span
      v-else-if="src"
      class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-default/90 text-default shadow-sm"
    >
      <UIcon
        name="i-lucide-pencil"
        class="size-3"
      />
    </span>
    <input
      ref="input"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onChange"
    >
  </button>
</template>
