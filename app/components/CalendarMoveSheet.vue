<script setup lang="ts">
import { isPastSlot, quickDays } from '~/utils/schedule'

/**
 * "Pindahkan ke…": a bottom sheet on phones, a dialog on desktop. Day chips (Hari ini, Besok, Sab 26…), any other
 * date, and for a post the time of day (prefilled). `mode="idea"` is date-only ("Jadwalkan ide ini").
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ mode: 'post' | 'idea', title: string, date: string | null, time?: string, tz: string }>()
const emit = defineEmits<{ save: [value: { date: string, time: string }] }>()
const { t, locale } = useI18n()

const chosen = ref('')
const clock = ref('09:00')
const today = computed(() => quickDays(props.tz, new Date(), 1)[0]!.date)
const chips = computed(() => quickDays(props.tz, new Date(), 7, locale.value === 'en' ? 'en-GB' : 'id-ID').map(d => ({
  value: d.date,
  label: d.labelKey === 'when.weekday' ? t('when.weekday', { day: d.weekday, date: Number(d.date.slice(8)) }) : t(d.labelKey)
})))

watch(open, (value) => {
  if (!value) return
  chosen.value = props.date && props.date >= today.value ? props.date : ''
  clock.value = props.time ?? '09:00'
})

// A time that already passed today is refused here instead of by the server.
const pastToday = computed(() => props.mode === 'post' && chosen.value === today.value && /^\d{2}:\d{2}$/.test(clock.value) && isPastSlot(chosen.value, clock.value, props.tz))
const valid = computed(() => chosen.value !== '' && chosen.value >= today.value && (props.mode === 'idea' || /^\d{2}:\d{2}$/.test(clock.value)) && !pastToday.value)
function save() {
  if (!valid.value) return
  emit('save', { date: chosen.value, time: clock.value })
  open.value = false
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="title"
  >
    <template #body>
      <div class="space-y-4">
        <CalendarDayChips
          v-model="chosen"
          :chips="chips"
          :min="today"
        />
        <UFormField
          v-if="mode === 'post'"
          :label="t('calendar.moveTime')"
        >
          <UInput
            v-model="clock"
            type="time"
            class="w-full sm:w-40"
          />
          <p
            v-if="pastToday"
            class="mt-1 text-xs text-error"
          >
            {{ t('calendar.movePastTime') }}
          </p>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full gap-2 justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('common.cancel')"
          @click="open = false"
        />
        <SaveButton
          :label="mode === 'post' ? t('calendar.moveSave') : t('calendar.scheduleSave')"
          :disabled="!valid"
          type="button"
          @click="save"
        />
      </div>
    </template>
  </ResponsiveSheet>
</template>
