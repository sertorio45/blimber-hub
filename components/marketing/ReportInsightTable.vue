<script setup lang="ts">
import type { ReportMetricFormat } from '~/types/marketing-reports'
import { formatReportMetricValue } from '~/composables/marketing/useMarketingReportMetrics'

export interface ReportTableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: ReportMetricFormat | 'raw' | 'duration'
  sortable?: boolean
  /** Optional custom formatter override */
  formatFn?: (value: unknown, row: Record<string, unknown>) => string
}

const props = withDefaults(
  defineProps<{
    columns: ReportTableColumn[]
    rows: Record<string, unknown>[]
    emptyText?: string
    maxRows?: number
  }>(),
  {
    emptyText: 'Sem dados neste período.',
    maxRows: 25,
  },
)

const sortKey = ref<string | null>(null)
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(col: ReportTableColumn) {
  if (col.sortable === false)
    return
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = col.key
  sortDir.value = 'desc'
}

const sortedRows = computed(() => {
  const list = [...props.rows]
  if (!sortKey.value)
    return list.slice(0, props.maxRows)
  const key = sortKey.value
  list.sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const an = typeof av === 'number' ? av : Number(av)
    const bn = typeof bv === 'number' ? bv : Number(bv)
    if (Number.isFinite(an) && Number.isFinite(bn))
      return sortDir.value === 'asc' ? an - bn : bn - an
    const as = String(av ?? '')
    const bs = String(bv ?? '')
    return sortDir.value === 'asc' ? as.localeCompare(bs, 'pt-BR') : bs.localeCompare(as, 'pt-BR')
  })
  return list.slice(0, props.maxRows)
})

function cellValue(col: ReportTableColumn, row: Record<string, unknown>): string {
  if (col.formatFn)
    return col.formatFn(row[col.key], row)
  const raw = row[col.key]
  if (col.format === 'raw' || col.format == null)
    return raw == null || raw === '' ? '—' : String(raw)
  if (col.format === 'duration') {
    const n = Number(raw || 0)
    if (!Number.isFinite(n) || n <= 0)
      return '—'
    const total = Math.round(n)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  return formatReportMetricValue(
    raw == null ? null : Number(raw),
    col.format,
  )
}
</script>

<template>
  <div v-if="!rows.length" class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
    {{ emptyText }}
  </div>
  <div v-else class="overflow-x-auto rounded-lg border">
    <table class="w-full min-w-[520px] text-left text-sm">
      <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-2.5 font-medium"
            :class="col.align === 'right' ? 'text-right' : 'text-left'"
          >
            <button
              v-if="col.sortable !== false"
              type="button"
              class="inline-flex items-center gap-1 hover:text-foreground"
              :class="col.align === 'right' ? 'ml-auto' : ''"
              @click="toggleSort(col)"
            >
              {{ col.label }}
              <Icon
                v-if="sortKey === col.key"
                :name="sortDir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                class="h-3.5 w-3.5"
              />
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, idx) in sortedRows"
          :key="String(row._id ?? row.id ?? idx)"
          class="border-b last:border-0 hover:bg-muted/20"
        >
          <td
            v-for="col in columns"
            :key="`${idx}-${col.key}`"
            class="px-3 py-2"
            :class="[
              col.align === 'right' ? 'text-right tabular-nums' : '',
              col.key === columns[0]?.key ? 'font-medium' : '',
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ cellValue(col, row) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
