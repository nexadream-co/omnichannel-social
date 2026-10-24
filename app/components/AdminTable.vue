<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'

/* eslint-disable @typescript-eslint/no-explicit-any -- a page's TableColumn<Row> would stop T being inferred from `data` */
type Column = TableColumn<any>
/* eslint-enable @typescript-eslint/no-explicit-any */

/** UTable on tablets and desktops, cards on phones (AdminCardList). Same `<key>-cell` slots for both. */
defineOptions({ inheritAttrs: false })
defineProps<{ data: T[], columns: Column[], loading?: boolean, empty?: string }>()
defineSlots<Record<string, (props: { row: { original: T } }) => unknown>>()
</script>

<template>
  <div>
    <AdminCardList
      class="sm:hidden"
      :rows="data"
      :columns="columns"
      :loading="loading"
      :empty="empty"
    >
      <template
        v-for="(_, name) in $slots"
        #[name]="slotProps"
      >
        <slot
          :name="name"
          v-bind="(slotProps as { row: { original: T } })"
        />
      </template>
    </AdminCardList>
    <UTable
      v-bind="$attrs"
      class="hidden sm:block"
      :data="data"
      :columns="columns"
      :loading="loading"
      :empty="empty"
    >
      <template
        v-for="(_, name) in $slots"
        #[name]="slotProps"
      >
        <slot
          :name="name"
          v-bind="(slotProps as { row: { original: T } })"
        />
      </template>
    </UTable>
  </div>
</template>
