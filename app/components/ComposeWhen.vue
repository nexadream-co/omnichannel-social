<script setup lang="ts">
import { clockLabel, matchingChip } from '~/utils/compose-when'
import { quickPostSlots } from '~/utils/schedule'

/** "Kapan diposting?": one-tap time chips, with the date and time inputs behind "Pilih sendiri…". */
const slot = defineModel<{ date: string, time: string }>({ required: true })
const props = defineProps<{ tz: string }>()
const { t, locale } = useI18n()

const chips = computed(() => quickPostSlots(props.tz))
const picked = computed(() => matchingChip(chips.value, slot.value))
// A time that is not one of the chips (from the calendar, or an edited post) opens the inputs straight away.
const custom = ref(!matchingChip(quickPostSlots(props.tz), slot.value))
const showInputs = computed(() => custom.value || !picked.value)

function choose(chip: { date: string, time: string }) {
  custom.value = false
  slot.value = { date: chip.date, time: chip.time }
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="flex flex-wrap gap-2"
      role="radiogroup"
      :aria-label="t('composer.when')"
    >
      <UButton
        v-for="chip in chips"
        :key="chip.key"
        size="sm"
        role="radio"
        :aria-checked="!showInputs && picked?.key === chip.key"
        :color="!showInputs && picked?.key === chip.key ? 'primary' : 'neutral'"
        :variant="!showInputs && picked?.key === chip.key ? 'solid' : 'outline'"
        :label="t(`when.${chip.key}`, { time: clockLabel(chip.time, locale) })"
        @click="choose(chip)"
      />
      <UButton
        size="sm"
        role="radio"
        :aria-checked="showInputs"
        :color="showInputs ? 'primary' : 'neutral'"
        :variant="showInputs ? 'solid' : 'outline'"
        icon="i-lucide-calendar-days"
        :label="t('when.custom')"
        @click="custom = true"
      />
    </div>
    <div
      v-if="showInputs"
      class="grid grid-cols-2 gap-2"
    >
      <UFormField :label="t('composer.date')">
        <UInput
          v-model="slot.date"
          type="date"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="t('composer.time')">
        <UInput
          v-model="slot.time"
          type="time"
          class="w-full"
        />
      </UFormField>
    </div>
    <p class="text-xs text-muted">
      {{ t(`timezones.${tz}`).split(' ')[0] }}
    </p>
  </div>
</template>
