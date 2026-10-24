<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'

/* eslint-disable @typescript-eslint/no-explicit-any -- a page's TableColumn<Row> would stop T being inferred from `data` */
type Column = TableColumn<any>
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Phone version of an admin table: one card per row. The first column is the card title, the `actions` column sits
 * top right, every other column is a "label: value" line. Cells reuse the table's `<key>-cell` slots, so a page
 * writes its cell markup once (see AdminTable).
 */
const props = defineProps<{ rows: T[], columns: Column[], loading?: boolean, empty?: string }>()
defineSlots<Record<string, (props: { row: { original: T } }) => unknown>>()

const keyOf = (column: Column) => String((column as { accessorKey?: string }).accessorKey ?? column.id ?? '')
const titleColumn = computed(() => props.columns[0])
const actionsColumn = computed(() => props.columns.find(column => keyOf(column) === 'actions' || (column.header === '' && column !== props.columns[0])))
const metaColumns = computed(() => props.columns.filter(column => column !== titleColumn.value && column !== actionsColumn.value))
const field = (row: T, key: string) => (row as Record<string, unknown>)[key]
const rowKey = (row: T, index: number) => String(field(row, 'id') ?? index)
</script>

<template>
  <div>
    <div
      v-if="loading && !rows.length"
      class="space-y-3 p-4"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-16 w-full"
      />
    </div>
    <p
      v-else-if="!rows.length"
      class="p-6 text-center text-sm text-muted"
    >
      {{ empty }}
    </p>
    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="(row, index) in rows"
        :key="rowKey(row, index)"
        class="space-y-2 p-4"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <slot
              :name="`${keyOf(titleColumn!)}-cell`"
              :row="{ original: row }"
            >
              {{ field(row, keyOf(titleColumn!)) }}
            </slot>
          </div>
          <div
            v-if="actionsColumn"
            class="shrink-0"
          >
            <slot
              :name="`${keyOf(actionsColumn)}-cell`"
              :row="{ original: row }"
            />
          </div>
        </div>
        <dl class="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
          <template
            v-for="column in metaColumns"
            :key="keyOf(column)"
          >
            <dt class="text-muted">
              {{ column.header }}
            </dt>
            <dd class="min-w-0 break-words text-default">
              <slot
                :name="`${keyOf(column)}-cell`"
                :row="{ original: row }"
              >
                {{ field(row, keyOf(column)) ?? '—' }}
              </slot>
            </dd>
          </template>
        </dl>
      </li>
    </ul>
  </div>
</template>
