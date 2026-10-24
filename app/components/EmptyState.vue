<script setup lang="ts">
export interface EmptyAction {
  label: string
  to?: string
  icon?: string
  onClick?: () => void
  loading?: boolean
}

const props = defineProps<{
  icon: string
  title: string
  description?: string
  action?: EmptyAction
  tone?: 'default' | 'happy'
  compact?: boolean
}>()

const happy = computed(() => props.tone === 'happy')
</script>

<template>
  <UEmpty
    variant="naked"
    :title="title"
    :description="description"
    :ui="{ root: compact ? 'py-6' : 'py-10', header: 'max-w-sm' }"
  >
    <template #leading>
      <slot name="art">
        <div
          class="relative grid place-items-center rounded-full"
          :class="[compact ? 'size-12' : 'size-[72px]', happy ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary']"
          aria-hidden="true"
        >
          <UIcon
            :name="icon"
            :class="compact ? 'size-6' : 'size-8'"
          />
          <span
            class="art-ink absolute -top-1 -right-1 size-2 rounded-full bg-current opacity-70"
          />
          <span
            class="art-ink absolute -bottom-0.5 -left-2 size-1.5 rounded-full bg-current opacity-50"
          />
        </div>
      </slot>
    </template>
    <template
      v-if="$slots.default || action"
      #body
    >
      <div class="flex flex-col items-center gap-4 w-full">
        <slot />
        <UButton
          v-if="action"
          :to="action.to"
          :icon="action.icon"
          :label="action.label"
          :loading="action.loading"
          @click="action.onClick?.()"
        />
      </div>
    </template>
  </UEmpty>
</template>
