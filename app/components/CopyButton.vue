<script setup lang="ts">
import { haptic } from '~/utils/haptics'

const props = withDefaults(defineProps<{
  text: string | (() => string | Promise<string>)
  label?: string
  copiedLabel?: string
  icon?: string
  color?: 'primary' | 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'secondary'
  variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  block?: boolean
  iconOnly?: boolean
}>(), { icon: 'i-lucide-copy', color: 'neutral', variant: 'outline' })

const emit = defineEmits<{ copied: [] }>()
const { t } = useI18n()
const toast = useToast()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
onScopeDispose(() => clearTimeout(timer))

const idleLabel = computed(() => props.label ?? t('common.copyLink'))
const doneLabel = computed(() => props.copiedLabel ?? t('common.copied'))

async function copy() {
  const value = typeof props.text === 'function' ? await props.text() : props.text
  if (!await copyText(value)) {
    toast.add({ title: t('common.copyFailed'), color: 'error' })
    return
  }
  copied.value = true
  haptic('tick')
  emit('copied')
  clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <UButton
    :icon="copied ? 'i-lucide-check' : icon"
    :label="iconOnly ? undefined : copied ? doneLabel : idleLabel"
    :aria-label="iconOnly ? idleLabel : undefined"
    :color="copied ? 'success' : color"
    :variant="variant"
    :size="size"
    :block="block"
    :square="iconOnly"
    @click="copy"
  >
    <template #trailing>
      <span
        class="sr-only"
        aria-live="polite"
      >{{ copied ? doneLabel : '' }}</span>
    </template>
  </UButton>
</template>
