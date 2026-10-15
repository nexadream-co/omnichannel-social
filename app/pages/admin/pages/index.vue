<script setup lang="ts">
interface Row { id: string, slug: string, title: string, isPublished: boolean, updatedAt: string }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Halaman' })
const auth = useStaffAuth()
const rows = ref<Row[] | null>(null)
onMounted(async () => {
  rows.value = (await apiFetch<{ items: Row[] }>('/api/admin/pages')).items
})
</script>

<template>
  <div class="max-w-4xl">
    <CommandBar
      title="Halaman"
      description="Halaman publik seperti kebijakan privasi dan syarat. Privasi dan syarat wajib selalu terbit untuk review Meta."
    >
      <UButton
        v-if="auth.hasPermission('pages.write')"
        to="/admin/pages/new"
        icon="i-lucide-plus"
        label="Halaman baru"
      />
    </CommandBar>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        v-if="!rows"
        class="p-4"
      >
        <USkeleton class="h-24 w-full" />
      </div>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="row in rows"
          :key="row.id"
        >
          <NuxtLink
            :to="`/admin/pages/${row.id}`"
            class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">
                {{ row.title }}
              </p>
              <p class="text-xs text-muted">
                /page/{{ row.slug }} · diubah {{ formatDateTime(row.updatedAt) }}
              </p>
            </div>
            <UBadge
              :color="row.isPublished ? 'success' : 'neutral'"
              variant="subtle"
              :label="row.isPublished ? 'Terbit' : 'Draf'"
            />
          </NuxtLink>
        </li>
      </ul>
    </UCard>
  </div>
</template>
