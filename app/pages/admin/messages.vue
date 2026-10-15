<script setup lang="ts">
interface Message { id: string, name: string, email: string, phone: string | null, subject: string | null, message: string, status: 'new' | 'read' | 'replied' | 'archived', handledAt: string | null, createdAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pesan masuk' })
const toast = useToast()
const auth = useStaffAuth()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('messages.write'))
const status = ref('all')
const filters = computed(() => ({ status: status.value }))
const list = useServerList<Message>('/api/admin/messages', { filters, limit: 25 })
onMounted(list.refresh)
const STATUS: Record<string, { label: string, color: 'info' | 'neutral' | 'success' | 'warning' }> = { new: { label: 'Baru', color: 'info' }, read: { label: 'Dibaca', color: 'neutral' }, replied: { label: 'Dibalas', color: 'success' }, archived: { label: 'Diarsipkan', color: 'neutral' } }
const tabs = [{ value: 'all', label: 'Semua' }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))]
const selected = ref<Message | null>(null)
async function setStatus(m: Message, next: Message['status']) {
  await apiFetch(`/api/admin/messages/${m.id}`, { method: 'PATCH', body: { status: next } })
  m.status = next
  await list.refresh()
}
async function openMessage(m: Message) {
  selected.value = m
  if (m.status === 'new' && canWrite.value) await setStatus(m, 'read')
}
async function remove(m: Message) {
  if (!await confirm({ title: 'Hapus pesan ini?', color: 'error', confirmLabel: 'Hapus' })) return
  await apiFetch(`/api/admin/messages/${m.id}`, { method: 'DELETE' })
  selected.value = null
  toast.add({ title: 'Pesan dihapus.', color: 'success' })
  await list.refresh()
}
</script>

<template>
  <div class="max-w-5xl">
    <CommandBar
      title="Pesan masuk"
      description="Pesan dari formulir kontak di situs."
    />
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UTabs
        v-model="status"
        :items="tabs"
        :content="false"
        size="sm"
      />
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nama, email atau isi"
        class="flex-1 min-w-56"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <p
        v-if="!list.items.value.length"
        class="p-6 text-center text-sm text-muted"
      >
        Tidak ada pesan.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="m in list.items.value"
          :key="m.id"
        >
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-elevated/50 flex gap-3"
            @click="openMessage(m)"
          >
            <span
              class="size-2 rounded-full mt-2 shrink-0"
              :class="m.status === 'new' ? 'bg-primary' : 'bg-transparent'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span
                  class="text-sm"
                  :class="m.status === 'new' ? 'font-semibold text-highlighted' : 'text-default'"
                >{{ m.name }}</span>
                <span class="text-xs text-muted truncate">{{ m.email }}</span>
                <span class="text-xs text-muted ml-auto shrink-0">{{ formatDateTime(m.createdAt) }}</span>
              </div>
              <p class="text-sm text-default truncate">
                {{ m.subject || m.message }}
              </p>
            </div>
            <UBadge
              size="sm"
              variant="subtle"
              :color="STATUS[m.status]!.color"
              :label="STATUS[m.status]!.label"
              class="shrink-0 self-center"
            />
          </button>
        </li>
      </ul>
    </UCard>
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center mt-4"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
      />
    </div>
    <USlideover
      :open="Boolean(selected)"
      :title="selected?.subject || 'Pesan'"
      :description="selected ? `${selected.name} · ${selected.email}${selected.phone ? ` · ${selected.phone}` : ''}` : ''"
      @update:open="(v: boolean) => { if (!v) selected = null }"
    >
      <template #body>
        <p
          v-if="selected"
          class="text-sm text-default whitespace-pre-line"
        >
          {{ selected.message }}
        </p>
      </template>
      <template #footer>
        <div
          v-if="selected && canWrite"
          class="flex flex-wrap gap-2 w-full"
        >
          <UButton
            :to="`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject ?? 'Pesan Anda'}`)}`"
            external
            icon="i-lucide-reply"
            label="Balas lewat email"
            @click="setStatus(selected, 'replied')"
          />
          <UButton
            color="neutral"
            variant="outline"
            label="Arsipkan"
            @click="setStatus(selected, 'archived')"
          />
          <UButton
            color="neutral"
            variant="ghost"
            label="Tandai baru"
            @click="setStatus(selected, 'new')"
          />
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            class="ml-auto"
            aria-label="Hapus"
            @click="remove(selected)"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
