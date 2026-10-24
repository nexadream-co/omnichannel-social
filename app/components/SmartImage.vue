<script setup lang="ts">
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

const props = withDefaults(defineProps<{
  src?: string | null
  alt?: string
  title?: string | null
  merchant?: Merchant | null
  kind?: 'product' | 'media' | 'post' | 'avatar'
  fit?: 'cover' | 'contain'
  loading?: 'lazy' | 'eager'
  imgClass?: string
}>(), { alt: '', kind: 'product', fit: 'cover', loading: 'lazy' })

const emit = defineEmits<{ error: [] }>()

const failed = ref(false)
const loaded = ref(false)
watch(() => props.src, () => {
  failed.value = false
  loaded.value = false
})

const showImage = computed(() => Boolean(props.src) && !failed.value)
const initial = computed(() => initialOf(props.title ?? props.alt))
const tint = computed(() => props.merchant ? tintOf(MERCHANT_META[props.merchant].color) : undefined)
const cornerIcon = computed(() => props.kind === 'product' ? 'i-lucide-shopping-bag' : props.kind === 'avatar' ? undefined : 'i-lucide-image')

function onError() {
  failed.value = true
  emit('error')
}
</script>

<template>
  <div class="relative overflow-hidden [container-type:size]">
    <img
      v-if="showImage"
      :src="src!"
      :alt="alt"
      :loading="loading"
      class="absolute inset-0 size-full motion-safe:transition-opacity motion-safe:duration-150"
      :class="[fit === 'contain' ? 'object-contain' : 'object-cover', loaded ? 'opacity-100' : 'opacity-0', imgClass]"
      @load="loaded = true"
      @error="onError"
    >
    <div
      v-else
      class="absolute inset-0 grid place-items-center"
      :class="tint ? '' : 'bg-primary/10'"
      :style="tint ? { backgroundColor: tint } : undefined"
      role="img"
      :aria-label="alt || title || undefined"
    >
      <span
        v-if="initial"
        class="font-semibold text-highlighted leading-none text-[min(40cqw,2.5rem)]"
      >{{ initial }}</span>
      <UIcon
        v-if="cornerIcon"
        :name="cornerIcon"
        class="absolute right-1 bottom-1 size-3.5 text-muted"
      />
    </div>
  </div>
</template>
