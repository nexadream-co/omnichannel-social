<script setup lang="ts">
interface Health { ok: boolean, db: boolean, tickAgeSeconds: number | null, oldestDueJobSeconds: number | null }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Dasbor' })

const auth = useStaffAuth()
const toast = useToast()
const health = ref<Health | null>(null)
const running = ref(false)

async function loadHealth() {
  health.value = await $fetch<Health>('/healthz', { ignoreResponseError: true }).catch(() => null)
}
onMounted(loadHealth)

async function runNoop() {
  running.value = true
  try {
    await apiFetch('/api/admin/system/jobs/system.noop/run', { method: 'POST' })
    toast.add({ title: 'Pekerjaan uji dijalankan.', color: 'success' })
    setTimeout(loadHealth, 1500)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Terjadi kesalahan.'), color: 'error' })
  } finally {
    running.value = false
  }
}

const ago = (seconds: number | null) => seconds === null ? 'Belum pernah' : `${seconds} detik lalu`
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">
        Dasbor
      </h1>
      <p class="text-muted">
        Masuk sebagai {{ auth.profile.value?.user.name }} ({{ auth.profile.value?.user.role.name }})
      </p>
    </div>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            Kesehatan sistem
          </h2>
          <UBadge
            v-if="health"
            :color="health.ok ? 'success' : 'warning'"
            :label="health.ok ? 'Sehat' : 'Perlu dicek'"
            variant="subtle"
          />
        </div>
      </template>
      <dl class="grid sm:grid-cols-3 gap-4 text-sm">
        <div>
          <dt class="text-muted">
            Database
          </dt>
          <dd class="font-medium">
            {{ health?.db ? 'Terhubung' : 'Tidak terhubung' }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Tick terakhir
          </dt>
          <dd class="font-medium">
            {{ ago(health?.tickAgeSeconds ?? null) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Pekerjaan tertunda tertua
          </dt>
          <dd class="font-medium">
            {{ health?.oldestDueJobSeconds === null ? 'Tidak ada' : ago(health?.oldestDueJobSeconds ?? null) }}
          </dd>
        </div>
      </dl>
      <template
        v-if="auth.hasPermission('settings.write')"
        #footer
      >
        <UButton
          icon="i-lucide-play"
          variant="outline"
          :loading="running"
          label="Jalankan pekerjaan uji"
          @click="runNoop"
        />
      </template>
    </UCard>
  </div>
</template>
