<script setup lang="ts">
import type { LinkRow } from '~/pages/app/links/index.vue'

/** What a follower sees: their comment, then the DM. {nama} and {link} are shown with real-looking values. */
const props = defineProps<{ keyword?: string | null, message: string, link: LinkRow | null }>()
const { t, locale } = useI18n()

const SAMPLE_NAME = 'sinta'
const comment = computed(() => `${props.keyword?.trim() || t('autoReply.previewKeyword')} kak 😍`)

type Part = { kind: 'text' | 'name' | 'link', text: string }
const parts = computed<Part[]>(() => {
  const out: Part[] = []
  for (const piece of props.message.split(/(\{nama\}|\{link\})/i)) {
    if (!piece) continue
    const token = piece.toLowerCase()
    out.push({ kind: token === '{nama}' ? 'name' : token === '{link}' ? 'link' : 'text', text: piece })
  }
  return out
})
// The server appends the link when the message has no {link}, so the card shows either way.
const hasToken = computed(() => parts.value.some(part => part.kind === 'link'))
</script>

<template>
  <div
    class="space-y-2 rounded-lg bg-elevated/60 p-3"
    role="group"
    :aria-label="t('autoReply.previewTitle')"
  >
    <p class="text-xs font-medium text-muted">
      {{ t('autoReply.previewTitle') }}
    </p>
    <div class="flex items-end gap-2">
      <UAvatar
        :alt="SAMPLE_NAME"
        size="2xs"
      />
      <div class="max-w-[85%] rounded-2xl rounded-bl-sm bg-default px-3 py-2 text-sm text-default shadow-xs">
        <span class="block text-xs font-medium text-muted">@{{ SAMPLE_NAME }}</span>
        {{ comment }}
      </div>
    </div>
    <div class="flex justify-end">
      <div class="max-w-[90%] space-y-2 rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-sm text-default">
        <p class="whitespace-pre-line break-words">
          <template
            v-for="(part, index) in parts"
            :key="index"
          >
            <span
              v-if="part.kind === 'name'"
              class="font-medium"
            >@{{ SAMPLE_NAME }}</span>
            <UBadge
              v-else-if="part.kind === 'link' && !link"
              color="primary"
              variant="subtle"
              size="sm"
              :label="t('autoReply.previewLink')"
            />
            <span v-else>{{ part.text }}</span>
          </template>
        </p>
        <div
          v-if="link && (hasToken || message.trim())"
          class="flex items-center gap-2 rounded-lg bg-default p-2"
        >
          <SmartImage
            :src="link.imageUrl"
            :title="link.title"
            :merchant="link.merchant"
            kind="product"
            class="size-12 shrink-0 rounded-md"
          />
          <div class="min-w-0">
            <p class="line-clamp-2 text-xs font-medium text-highlighted">
              {{ link.title || link.destinationUrl }}
            </p>
            <p
              v-if="link.priceIdr"
              class="text-xs text-muted"
            >
              {{ formatIDR(link.priceIdr, locale) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
