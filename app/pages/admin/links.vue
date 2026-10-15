<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface LinkRow { id: string, slug: string, active: boolean, destinationUrl: string, title: string | null, workspaceId: string, workspaceName: string, clicks7d: number, domain: string, onAllowlist: boolean }
interface BioRow { id: string, handle: string, title: string | null, published: boolean, workspaceId: string, workspaceName: string, updatedAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Moderasi link & Etalase' })
const toast = useToast()
const auth = useStaffAuth()
const canWrite = computed(() => auth.hasPermission('links.write'))
const tab = ref<'links' | 'bio'>('links')
const flagged = ref('all')
const linkFilters = computed(() => ({ flagged: flagged.value }))
const links = useServerList<LinkRow>('/api/admin/links', { filters: linkFilters, limit: 25 })
const bios = useServerList<BioRow>('/api/admin/bio-pages', { limit: 25 })
onMounted(() => Promise.all([links.refresh(), bios.refresh()]))

const reasonOpen = ref(false)
const reason = ref('')
const pending = ref<{ kind: 'link' | 'bio', id: string, label: string } | null>(null)
const saving = ref(false)
function ask(kind: 'link' | 'bio', id: string, label: string) {
  pending.value = { kind, id, label }
  reason.value = ''
  reasonOpen.value = true
}
async function confirmModeration() {
  if (!pending.value) return
  saving.value = true
  try {
    const p = pending.value
    await apiFetch(p.kind === 'link' ? `/api/admin/links/${p.id}/disable` : `/api/admin/bio-pages/${p.id}/unpublish`, { method: 'POST', body: { reason: reason.value } })
    toast.add({ title: p.kind === 'link' ? 'Link dinonaktifkan. Pemilik diberi tahu.' : 'Etalase diturunkan. Pemilik diberi tahu.', color: 'success' })
    reasonOpen.value = false
    await (p.kind === 'link' ? links.refresh() : bios.refresh())
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal.'), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function enable(row: LinkRow) {
  await apiFetch(`/api/admin/links/${row.id}/enable`, { method: 'POST' })
  toast.add({ title: 'Link aktif lagi.', color: 'success' })
  await links.refresh()
}
const linkColumns: TableColumn<LinkRow>[] = [
  { accessorKey: 'slug', header: 'Link pendek' },
  { accessorKey: 'domain', header: 'Tujuan' },
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'clicks7d', header: 'Klik 7 hari' },
  { accessorKey: 'actions', header: '' }
]
const bioColumns: TableColumn<BioRow>[] = [
  { accessorKey: 'handle', header: 'Etalase' },
  { accessorKey: 'workspaceName', header: 'Ruang kerja' },
  { accessorKey: 'published', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="space-y-4">
    <CommandBar
      title="Moderasi link & Etalase"
      description="Tangani penyalahgunaan. Daftar domain afiliasi diatur di Pengaturan → Kanal."
    />
    <UTabs
      v-model="tab"
      :items="[{ value: 'links', label: 'Link pendek' }, { value: 'bio', label: 'Etalase' }]"
      :content="false"
    />
    <template v-if="tab === 'links'">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="links.search.value"
          icon="i-lucide-search"
          placeholder="Cari slug, domain tujuan atau ruang kerja"
          class="flex-1 min-w-56"
        />
        <USelect
          v-model="flagged"
          :items="[{ value: 'all', label: 'Semua' }, { value: 'outside', label: 'Di luar domain afiliasi' }, { value: 'disabled', label: 'Dinonaktifkan' }]"
          class="w-56"
        />
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <UTable
          :data="links.items.value"
          :columns="linkColumns"
          :loading="links.status.value === 'loading'"
          empty="Tidak ada link."
        >
          <template #slug-cell="{ row }">
            <code class="text-xs">{{ row.original.slug }}</code>
            <UBadge
              v-if="!row.original.active"
              size="sm"
              color="error"
              variant="subtle"
              label="Nonaktif"
              class="ml-1"
            />
            <p class="text-xs text-muted truncate max-w-56">
              {{ row.original.title ?? '' }}
            </p>
          </template>
          <template #domain-cell="{ row }">
            <a
              :href="row.original.destinationUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm hover:text-primary"
            >{{ row.original.domain }}</a>
            <UBadge
              v-if="!row.original.onAllowlist"
              size="sm"
              color="warning"
              variant="subtle"
              label="di luar afiliasi"
              class="ml-1"
            />
          </template>
          <template #workspaceName-cell="{ row }">
            <NuxtLink
              :to="`/admin/workspaces/${row.original.workspaceId}`"
              class="hover:text-primary"
            >
              {{ row.original.workspaceName }}
            </NuxtLink>
          </template>
          <template #actions-cell="{ row }">
            <template v-if="canWrite">
              <UButton
                v-if="row.original.active"
                size="xs"
                color="error"
                variant="soft"
                label="Nonaktifkan"
                @click="ask('link', row.original.id, row.original.slug)"
              />
              <UButton
                v-else
                size="xs"
                color="neutral"
                variant="outline"
                label="Aktifkan lagi"
                @click="enable(row.original)"
              />
            </template>
          </template>
        </UTable>
      </UCard>
      <div
        v-if="links.pageCount.value > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="links.page.value"
          :total="links.total.value"
          :items-per-page="links.limit.value"
        />
      </div>
    </template>
    <template v-else>
      <UInput
        v-model="bios.search.value"
        icon="i-lucide-search"
        placeholder="Cari nama Etalase atau ruang kerja"
        class="w-full"
      />
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <UTable
          :data="bios.items.value"
          :columns="bioColumns"
          :loading="bios.status.value === 'loading'"
          empty="Belum ada Etalase."
        >
          <template #handle-cell="{ row }">
            <a
              :href="`/bio/${row.original.handle}`"
              target="_blank"
              rel="noopener"
              class="hover:text-primary"
            >@{{ row.original.handle }}</a>
            <p class="text-xs text-muted">
              {{ row.original.title }}
            </p>
          </template>
          <template #workspaceName-cell="{ row }">
            <NuxtLink
              :to="`/admin/workspaces/${row.original.workspaceId}`"
              class="hover:text-primary"
            >
              {{ row.original.workspaceName }}
            </NuxtLink>
          </template>
          <template #published-cell="{ row }">
            <UBadge
              size="sm"
              variant="subtle"
              :color="row.original.published ? 'success' : 'neutral'"
              :label="row.original.published ? 'Terbit' : 'Tidak terbit'"
            />
          </template>
          <template #actions-cell="{ row }">
            <UButton
              v-if="canWrite && row.original.published"
              size="xs"
              color="error"
              variant="soft"
              label="Turunkan"
              @click="ask('bio', row.original.id, `@${row.original.handle}`)"
            />
          </template>
        </UTable>
      </UCard>
      <div
        v-if="bios.pageCount.value > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="bios.page.value"
          :total="bios.total.value"
          :items-per-page="bios.limit.value"
        />
      </div>
    </template>
    <FormSlideover
      v-model:open="reasonOpen"
      :title="pending?.kind === 'link' ? `Nonaktifkan ${pending?.label}` : `Turunkan ${pending?.label}`"
      description="Alasannya dikirim ke pemilik akun dan dicatat di log aktivitas."
      :loading="saving"
      :submit-label="pending?.kind === 'link' ? 'Nonaktifkan' : 'Turunkan'"
      @submit="confirmModeration"
    >
      <UFormField
        label="Alasan"
        required
      >
        <UTextarea
          v-model="reason"
          :rows="4"
          class="w-full"
          placeholder="Contoh: tujuan link adalah situs penipuan."
        />
      </UFormField>
    </FormSlideover>
  </div>
</template>
