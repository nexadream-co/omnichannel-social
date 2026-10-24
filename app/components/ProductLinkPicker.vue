<script setup lang="ts">
import { MERCHANT_META } from '#shared/utils/links'
import type { LinkRow } from '~/pages/app/links/index.vue'

/** Pick one saved product link (composer caption insert, auto-reply rules). */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [link: LinkRow] }>()
const { t, locale } = useI18n()

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

const creating = ref(false)
function onCreated(link: LinkRow) {
  creating.value = false
  pick({ ...link, clicks7d: link.clicks7d ?? 0 })
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('links.insert')"
    :description="t('links.insertHint')"
  >
    <template #body>
      <LinkPasteField
        compact
        class="mb-3"
        @start="creating = true"
        @done="onCreated"
        @fail="creating = false"
      />
      <UInput
        v-if="links.length > 5"
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('links.search')"
        class="w-full mb-3"
      />
      <div
        v-if="loading || creating"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-14 w-full"
        />
      </div>
      <EmptyState
        v-else-if="!links.length"
        compact
        icon="i-lucide-link"
        :title="t('links.insertEmptyTitle')"
        :description="t('links.insertEmpty')"
      />
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
            <SmartImage
              :src="link.imageUrl"
              :title="link.title"
              :merchant="link.merchant"
              kind="product"
              class="size-12 rounded shrink-0"
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
  </ResponsiveSheet>
</template>
