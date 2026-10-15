<script setup lang="ts">
import { PERMISSION_GROUP_LABELS, describePermission, type PermissionGroup, type PermissionKey } from '#shared/utils/permissions'

interface Row { id: string, key: string, group: string, description: string, roles: string[] }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Hak akses' })
const rows = ref<Row[]>([])
onMounted(async () => {
  rows.value = (await apiFetch<{ items: Row[] }>('/api/admin/permissions')).items
})
const grouped = computed(() => Object.entries(rows.value.reduce<Record<string, Row[]>>((acc, row) => {
  (acc[row.group] ??= []).push(row)
  return acc
}, {})))
</script>

<template>
  <div>
    <CommandBar
      title="Hak akses"
      description="Daftar hak akses (dari kode) dan peran yang memilikinya. Atur lewat halaman Peran."
    />
    <div class="grid gap-4 md:grid-cols-2">
      <UCard
        v-for="[group, items] in grouped"
        :key="group"
      >
        <template #header>
          <p class="font-semibold text-highlighted">
            {{ PERMISSION_GROUP_LABELS[group as PermissionGroup] ?? group }}
          </p>
        </template>
        <ul class="space-y-2 text-sm">
          <li
            v-for="item in items"
            :key="item.key"
          >
            <p class="text-default">
              {{ describePermission(item.key as PermissionKey) }} <code class="text-xs text-muted">{{ item.key }}</code>
            </p>
            <div class="flex flex-wrap gap-1 mt-1">
              <UBadge
                v-for="role in item.roles"
                :key="role"
                size="sm"
                color="neutral"
                variant="subtle"
                :label="role"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
