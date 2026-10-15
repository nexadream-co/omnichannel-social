<script setup lang="ts">
import { SETTING_GROUP_META, SETTING_GROUPS, type SettingDef, type SettingGroup } from '#shared/utils/settings'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pengaturan' })

const route = useRoute()
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('settings.write'))

const catalog = shallowRef<SettingDef[]>([])
const saved = ref<Record<string, string>>({})
const form = reactive<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const group = ref<SettingGroup>(SETTING_GROUPS.includes(route.query.group as SettingGroup) ? route.query.group as SettingGroup : 'company')
const testTo = ref('')
const testing = ref(false)

const KILL_SWITCH_COPY: Record<string, { on: string, off: string }> = {
  'channels.publishing.paused': {
    on: 'Semua postingan terjadwal milik SEMUA kreator berhenti terbit sampai jeda dicabut. Postingan tetap terjadwal dan terbit setelahnya.',
    off: 'Postingan terjadwal kembali terbit sesuai antrean.'
  },
  'channels.autoReply.enabled': {
    on: 'DM otomatis kembali dikirim untuk semua kreator.',
    off: 'Semua DM otomatis untuk SEMUA kreator berhenti. Komentar yang cocok dicatat tapi tidak dibalas.'
  }
}

async function load() {
  loading.value = true
  const response = await apiFetch<{ catalog: SettingDef[], values: Record<string, string> }>('/api/admin/settings')
  catalog.value = response.catalog
  saved.value = { ...response.values }
  Object.assign(form, response.values)
  loading.value = false
}
onMounted(load)

const tabs = computed(() => SETTING_GROUPS.map(value => ({ value, label: SETTING_GROUP_META[value].label, icon: SETTING_GROUP_META[value].icon })))
const fields = computed(() => catalog.value.filter(def => def.group === group.value))

async function save() {
  const values = Object.fromEntries(fields.value.map(def => [def.key, form[def.key] ?? '']))
  for (const key of Object.keys(KILL_SWITCH_COPY)) {
    if (key in values && values[key] !== saved.value[key]) {
      const turningOn = values[key] === 'true'
      const ok = await confirm({
        title: SETTINGS_LABEL(key),
        description: KILL_SWITCH_COPY[key]![turningOn ? 'on' : 'off'],
        confirmLabel: 'Ya, simpan',
        color: 'error'
      })
      if (!ok) return
    }
  }
  saving.value = true
  try {
    await apiFetch('/api/admin/settings', { method: 'PATCH', body: { values } })
    toast.add({ title: 'Pengaturan disimpan.', color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Pengaturan gagal disimpan.'), color: 'error' })
  } finally {
    saving.value = false
  }
}

function SETTINGS_LABEL(key: string) {
  return catalog.value.find(def => def.key === key)?.label ?? key
}

async function sendTest() {
  testing.value = true
  try {
    await apiFetch('/api/admin/settings/test-email', { method: 'POST', body: { to: testTo.value } })
    toast.add({ title: `Email uji dikirim ke ${testTo.value}.`, color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Email uji gagal dikirim.'), color: 'error' })
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-4xl mx-auto">
    <CommandBar
      title="Pengaturan"
      description="Konfigurasi platform yang bisa diubah tanpa deploy."
    />
    <!-- Six groups don't fit a phone: a select there, tabs from sm up. -->
    <div class="mb-4 sm:hidden">
      <USelect
        v-model="group"
        :items="tabs"
        class="w-full"
      />
    </div>
    <div class="mb-4 hidden sm:block">
      <UTabs
        v-model="group"
        :items="tabs"
        :content="false"
      />
    </div>
    <UCard v-if="loading">
      <div class="space-y-4">
        <USkeleton
          v-for="n in 5"
          :key="n"
          class="h-10 w-full"
        />
      </div>
    </UCard>
    <UCard v-else>
      <template #header>
        <p class="font-semibold text-highlighted">
          {{ SETTING_GROUP_META[group].label }}
        </p>
        <p class="text-sm text-muted">
          {{ SETTING_GROUP_META[group].description }}
        </p>
      </template>
      <div class="space-y-5">
        <UFormField
          v-for="def in fields"
          :key="def.key"
          :label="def.label"
          :hint="def.isSecret ? 'Rahasia' : undefined"
          :description="def.hint"
          :name="def.key"
        >
          <USwitch
            v-if="def.type === 'boolean'"
            :model-value="form[def.key] === 'true'"
            :disabled="!canWrite"
            @update:model-value="(value: boolean) => form[def.key] = String(value)"
          />
          <UTextarea
            v-else-if="def.type === 'text' || def.type === 'json'"
            v-model="form[def.key]"
            :rows="def.type === 'json' ? 6 : 3"
            autoresize
            :disabled="!canWrite"
            class="w-full"
            :ui="{ base: def.type === 'json' ? 'font-mono text-xs' : '' }"
          />
          <USelect
            v-else-if="def.type === 'select'"
            v-model="form[def.key]"
            :items="def.options ?? []"
            :disabled="!canWrite"
            class="w-full"
          />
          <UInput
            v-else
            v-model="form[def.key]"
            :type="def.type === 'secret' ? 'password' : def.type === 'number' ? 'number' : 'text'"
            :disabled="!canWrite"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
      </div>
      <template
        v-if="canWrite"
        #footer
      >
        <div class="flex justify-end">
          <UButton
            :loading="saving"
            label="Simpan"
            @click="save"
          />
        </div>
      </template>
    </UCard>
    <UCard
      v-if="group === 'email' && canWrite && !loading"
      class="mt-4"
    >
      <p class="font-semibold text-highlighted mb-1">
        Kirim email uji
      </p>
      <p class="text-sm text-muted mb-3">
        Simpan pengaturan terlebih dahulu, lalu kirim email uji untuk memastikan pengiriman berjalan.
      </p>
      <div class="flex flex-col sm:flex-row gap-2">
        <UInput
          v-model="testTo"
          type="email"
          placeholder="nama@contoh.com"
          class="flex-1"
        />
        <UButton
          :loading="testing"
          :disabled="!testTo"
          icon="i-lucide-send"
          label="Kirim email uji"
          variant="outline"
          @click="sendTest"
        />
      </div>
    </UCard>
  </div>
</template>
