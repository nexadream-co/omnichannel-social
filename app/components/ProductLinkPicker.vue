<script setup lang="ts">
import { MERCHANT_META } from '#shared/utils/links'
import type { LinkRow } from '~/pages/app/links/index.vue'

/** Pick one saved product link (composer caption insert, auto-reply rules). */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [link: LinkRow] }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const search = ref('')
const links = ref<LinkRow[]>([])
const loading = ref(false)
watch(open, async (value) => {
  if (!value) return
  loading.value = true
  try {
    links.value = (await apiFetch<{ items: LinkRow[] }>('/api/app/links', { query: { archived: 'false', limit: 100 } })).items
  } finally {
    loading.value = false
  }
})
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? links.value.filter(link => (link.title ?? link.destinationUrl).toLowerCase().includes(q)) : links.value
})
function pick(link: LinkRow) {
  emit('pick', link)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('links.insert')"
    :description="t('links.insertHint')"
  >
    <template #body>
      <UInput
        v-if="links.length > 5"
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('links.search')"
        class="w-full mb-3"
      />
      <div
        v-if="loading"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-14 w-full"
        />
      </div>
      <div
        v-else-if="!links.length"
        class="text-center py-4 space-y-3"
      >
        <p class="text-sm text-muted">
          {{ t('links.insertEmpty') }}
        </p>
        <UButton
          :to="localePath('/app/links')"
          icon="i-lucide-plus"
          variant="soft"
          :label="t('links.add')"
        />
      </div>
      <ul
        v-else
        class="divide-y divide-default -my-2"
      >
        <li
          v-for="link in filtered"
          :key="link.id"
        >
          <button
            type="button"
            class="w-full py-2 flex items-center gap-3 text-left hover:bg-elevated/50 rounded"
            @click="pick(link)"
          >
            <img
              v-if="link.imageUrl"
              :src="link.imageUrl"
              alt=""
              class="size-12 rounded object-cover shrink-0"
            >
            <div
              v-else
              class="size-12 rounded bg-elevated shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-default line-clamp-2">
                {{ link.title || link.destinationUrl }}
              </p>
              <p class="text-xs text-muted">
                <span :style="{ color: MERCHANT_META[link.merchant].color }">{{ MERCHANT_META[link.merchant].label }}</span>
                <span v-if="link.priceIdr"> · {{ formatIDR(link.priceIdr, locale) }}</span>
              </p>
            </div>
            <UIcon
              name="i-lucide-plus"
              class="size-4 text-primary shrink-0"
            />
          </button>
        </li>
      </ul>
    </template>
  </UModal>
</template>
