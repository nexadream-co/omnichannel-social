<script setup lang="ts">
import type { Merchant } from '#shared/utils/links'

export interface BioItemPatch { badge: string | null, categoryId: string | null, pinned: boolean, visible: boolean }

/**
 * Edit one Etalase product: photo, label, category, pin and hide. Opens on tap from the editor list. The photo
 * is saved on the product link right away (it shows everywhere the product does); `photo` asks for a reload.
 */
const props = defineProps<{
  item: { linkId: string | null, title: string | null, imageUrl: string | null, merchant: Merchant | null, badge: string | null, categoryId: string | null, pinned: boolean, visible: boolean } | null
  categories: { id: string, name: string }[]
  saving?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [patch: BioItemPatch], remove: [], photo: [] }>()
const { t } = useI18n()
const toast = useToast()
const productPhoto = useProductPhoto()

const form = reactive<BioItemPatch>({ badge: null, categoryId: null, pinned: false, visible: true })
watch(() => [props.item, open.value] as const, ([item, isOpen]) => {
  if (item && isOpen) Object.assign(form, { badge: item.badge, categoryId: item.categoryId, pinned: item.pinned, visible: item.visible })
}, { immediate: true })

const categoryOptions = computed(() => [{ label: t('bio.noCategory'), value: 'none' }, ...props.categories.map(c => ({ label: c.name, value: c.id }))])

const photoBusy = ref(false)
async function pickPhoto(file: File) {
  if (!props.item?.linkId) return
  photoBusy.value = true
  try {
    await productPhoto.setLinkPhoto(props.item.linkId, file)
    toast.add({ title: t('links.photoSaved'), color: 'success' })
    emit('photo')
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    photoBusy.value = false
  }
}

function submit() {
  emit('save', { ...form, badge: form.badge?.trim() || null })
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="item?.title ?? t('bio.itemTitle')"
    :description="t('bio.itemHint')"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="submit"
      >
        <div
          v-if="item?.linkId"
          class="flex items-center gap-3"
        >
          <ProductPhotoButton
            :src="item.imageUrl"
            :title="item.title"
            :merchant="item.merchant"
            :busy="photoBusy"
            class="size-16"
            @pick="pickPhoto"
          />
          <p class="text-sm text-muted">
            {{ item.imageUrl ? t('links.changePhoto') : t('links.previewNoPhoto') }}
          </p>
        </div>
        <UFormField :label="t('bio.badge')">
          <UInput
            :model-value="form.badge ?? ''"
            :maxlength="24"
            :placeholder="t('bio.badgePlaceholder')"
            class="w-full"
            @update:model-value="(v: string | number) => form.badge = String(v)"
          />
        </UFormField>
        <UFormField
          v-if="categories.length"
          :label="t('bio.category')"
        >
          <USelect
            :model-value="form.categoryId ?? 'none'"
            :items="categoryOptions"
            class="w-full"
            @update:model-value="(v: string) => form.categoryId = v === 'none' ? null : v"
          />
        </UFormField>
        <USwitch
          v-model="form.pinned"
          :label="t('bio.pin')"
          :description="t('bio.pinHint')"
        />
        <USwitch
          :model-value="!form.visible"
          :label="t('bio.hide')"
          :description="t('bio.hideHint')"
          @update:model-value="(v: boolean) => form.visible = !v"
        />
        <button
          type="submit"
          class="sr-only"
          tabindex="-1"
        >
          {{ t('common.save') }}
        </button>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :label="t('common.remove')"
          @click="emit('remove')"
        />
        <SaveButton
          :loading="saving"
          :busy-label="t('busy.saving')"
          @click="submit"
        />
      </div>
    </template>
  </ResponsiveSheet>
</template>
