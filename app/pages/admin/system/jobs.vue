<script setup lang="ts">
interface Overview {
  queues: { queue: string, queued: number, due: number, running: number, dead: number, oldest_due_seconds: number | null }[]
  deadJobs: { id: string, queue: string, attempts: number, lastError: string | null, finishedAt: string | null, workspaceId: string | null }[]
  schedules: { name: string, cron: string, tz: string, enabled: boolean, lastSlot: string | null, lastJobId: string | null }[]
  heartbeats: { name: string, beatAt: string, info: unknown }[]
}

definePageMeta({ layout: 'admin' })
useHead({ title: 'Antrean pekerjaan' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('settings.write'))
const data = ref<Overview | null>(null)
async function load() {
  data.value = await apiFetch<Overview>('/api/admin/system/jobs')
}
onMounted(load)
const busy = ref<string | null>(null)
async function run(name: string) {
  busy.value = name
  try {
    await apiFetch(`/api/admin/system/jobs/${name}/run`, { method: 'POST' })
    toast.add({ title: `${name} dijalankan.`, color: 'success' })
    setTimeout(load, 1500)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal.'), color: 'error' })
  } finally {
    busy.value = null
  }
}
async function retry(id: string) {
  busy.value = id
  try {
    await apiFetch(`/api/admin/system/jobs/dead/${id}/retry`, { method: 'POST' })
    toast.add({ title: 'Dicoba lagi.', color: 'success' })
    setTimeout(load, 1500)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal.'), color: 'error' })
  } finally {
    busy.value = null
  }
}
const ago = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  return s < 120 ? `${s} detik lalu` : s < 7200 ? `${Math.round(s / 60)} menit lalu` : formatDateTime(iso)
}
const BEAT: Record<string, string> = { tick: 'Tick (setiap menit)', media_processor: 'Media processor' }
</script>

<template>
  <div class="space-y-6">
    <CommandBar
      title="Antrean pekerjaan"
      description="Pekerjaan latar: publikasi, DM, media, penagihan dan pemeliharaan."
    >
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        label="Muat ulang"
        @click="load"
      />
    </CommandBar>
    <USkeleton
      v-if="!data"
      class="h-96 w-full"
    />
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard
          v-for="b in data.heartbeats"
          :key="b.name"
        >
          <p class="text-sm text-muted">
            {{ BEAT[b.name] ?? b.name }}
          </p>
          <p class="text-lg font-semibold text-highlighted">
            {{ ago(b.beatAt) }}
          </p>
        </UCard>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <p class="font-semibold text-highlighted">
            Antrean
          </p>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted border-b border-default">
                <th class="px-4 py-2 font-medium">
                  Antrean
                </th><th class="px-4 py-2 font-medium text-right">
                  Menunggu
                </th><th class="px-4 py-2 font-medium text-right">
                  Jatuh tempo
                </th><th class="px-4 py-2 font-medium text-right">
                  Berjalan
                </th><th class="px-4 py-2 font-medium text-right">
                  Gagal
                </th><th class="px-4 py-2 font-medium text-right">
                  Tertua jatuh tempo
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="q in data.queues"
                :key="q.queue"
              >
                <td class="px-4 py-2">
                  <code class="text-xs">{{ q.queue }}</code>
                </td>
                <td class="px-4 py-2 text-right">
                  {{ q.queued }}
                </td>
                <td
                  class="px-4 py-2 text-right"
                  :class="q.due ? 'text-warning' : ''"
                >
                  {{ q.due }}
                </td>
                <td class="px-4 py-2 text-right">
                  {{ q.running }}
                </td>
                <td
                  class="px-4 py-2 text-right"
                  :class="q.dead ? 'text-error' : ''"
                >
                  {{ q.dead }}
                </td>
                <td class="px-4 py-2 text-right">
                  {{ q.oldest_due_seconds === null ? '—' : `${q.oldest_due_seconds} dtk` }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <p class="font-semibold text-highlighted">
            Jadwal
          </p>
        </template>
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="s in data.schedules"
            :key="s.name"
            class="px-4 py-2.5 flex flex-wrap items-center gap-3"
          >
            <code class="text-xs">{{ s.name }}</code>
            <span class="text-muted">{{ s.cron }} ({{ s.tz }})</span>
            <UBadge
              size="sm"
              variant="subtle"
              :color="s.enabled ? 'success' : 'neutral'"
              :label="s.enabled ? 'Aktif' : 'Mati'"
            />
            <span class="text-xs text-muted">terakhir {{ s.lastSlot ? formatDateTime(s.lastSlot) : '—' }}</span>
            <UButton
              v-if="canWrite && s.enabled"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-play"
              label="Jalankan sekarang"
              class="ml-auto"
              :loading="busy === s.name"
              @click="run(s.name)"
            />
          </li>
        </ul>
      </UCard>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <p class="font-semibold text-highlighted">
            Pekerjaan gagal
          </p>
        </template>
        <p
          v-if="!data.deadJobs.length"
          class="p-4 text-sm text-muted"
        >
          Tidak ada pekerjaan gagal.
        </p>
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="j in data.deadJobs"
            :key="j.id"
            class="px-4 py-2.5 flex flex-col sm:flex-row gap-2"
          >
            <div class="min-w-0 flex-1">
              <p><code class="text-xs">{{ j.queue }}</code> <span class="text-xs text-muted">· {{ j.attempts }} percobaan · {{ j.finishedAt ? formatDateTime(j.finishedAt) : '' }}</span></p>
              <p class="text-xs text-error break-all line-clamp-2">
                {{ j.lastError }}
              </p>
            </div>
            <UButton
              v-if="canWrite"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-ccw"
              label="Coba lagi"
              class="self-start"
              :loading="busy === j.id"
              @click="retry(j.id)"
            />
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
