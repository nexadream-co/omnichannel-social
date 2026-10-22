<script setup lang="ts">
import type { Layer } from '#shared/media/edit-spec'
import { STICKERS, stickerById } from '#shared/media/presets'

type StickerLayer = Extract<Layer, { type: 'sticker' }>

const props = defineProps<{ layer: StickerLayer | null }>()
const emit = defineEmits<{ add: [stickerId: string], update: [layer: StickerLayer] }>()
const { t } = useI18n()
const pickerOpen = ref(false)

const editable = computed(() => (props.layer ? stickerById(props.layer.sticker)?.editable ?? false : false))
const isPrice = computed(() => props.layer?.sticker === 'price')

function setLabel(value: string) {
  if (props.layer && value.trim()) emit('update', { ...props.layer, label: value.slice(0, 60) })
}

/** Fills the price tag from a saved product link (Link Produk). */
function fromProduct(item: { priceIdr?: number | null, title?: string | null }) {
  if (!item.priceIdr) return
  setLabel(`Rp ${new Intl.NumberFormat('id-ID').format(item.priceIdr)}`)
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="layer && editable"
      class="flex flex-wrap gap-2"
    >
      <UInput
        :model-value="layer.label ?? ''"
        class="flex-1 min-w-40"
        :maxlength="60"
        @update:model-value="setLabel(String($event))"
      />
      <UButton
        v-if="isPrice"
        icon="i-lucide-link"
        color="neutral"
        variant="soft"
        :label="t('mediaEditor.sticker.fromProduct')"
        @click="pickerOpen = true"
      />
    </div>
    <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
      <button
        v-for="sticker in STICKERS"
        :key="sticker.id"
        type="button"
        class="h-12 rounded-md border border-default hover:border-accented flex items-center justify-center px-1"
        @click="emit('add', sticker.id)"
      >
        <span
          v-if="sticker.shape === 'emoji'"
          class="text-2xl"
        >{{ sticker.emoji }}</span>
        <span
          v-else
          class="text-[10px] font-extrabold leading-tight px-1.5 py-1 truncate max-w-full"
          :class="sticker.shape === 'pill' ? 'rounded-full' : 'rounded-sm'"
          :style="{ backgroundColor: sticker.bg, color: sticker.fg }"
        >{{ t(sticker.labelKey!) }}</span>
      </button>
    </div>
    <ProductLinkPicker
      v-model:open="pickerOpen"
      @pick="fromProduct"
    />
  </div>
</template>
