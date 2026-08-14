<script setup lang="ts">
import type { MetaOrganicPeriod, MetaOrganicReportBlock, OrganicReportDateRange } from '~/types/marketing-organic-reports'

import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import ReportTrendChart from '@/components/marketing/ReportTrendChart.vue'
import {
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'
import {
  detailOrganicMetrics,
  primaryOrganicMetrics,
} from '~/constants/marketing-organic-metrics'
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'

const props = defineProps<{
  block?: MetaOrganicReportBlock | null
  period?: OrganicReportDateRange | null
  loading?: boolean
}>()

const platformLabel = computed(() => props.block?.platform === 'instagram' ? 'Instagram' : 'Facebook')
const userFacingError = computed(() =>
  props.block?.error ? toUserFacingReportError(props.block.error) : '',
)

const primaryDefs = computed(() =>
  props.block?.platform ? primaryOrganicMetrics(props.block.platform) : [],
)
const detailDefs = computed(() =>
  props.block?.platform ? detailOrganicMetrics(props.block.platform) : [],
)

const periodLabel = computed(() => {
  const base = periodLabelPt(props.period || undefined)
  const metaPeriod = props.period?.meta_period
  if (!metaPeriod || metaPeriod === 'day')
    return base
  const bucket: Record<MetaOrganicPeriod, string> = {
    day: 'Diário',
    week: 'Semanal',
    days_28: '28 dias',
  }
  return base ? `${base} · ${bucket[metaPeriod]}` : bucket[metaPeriod]
})

const chartSeries = computed(() => {
  const primary = primaryDefs.value[0]
  if (!primary)
    return []
  return [{ key: primary.key, label: primary.label }]
})

const tableRows = computed(() => {
  const series = props.block?.series || []
  return [...series].reverse().slice(0, 14).map((row) => {
    const out: Record<string, unknown> = { date: row.date }
    for (const def of [...primaryDefs.value, ...detailDefs.value])
      out[def.key] = row[def.key] ?? 0
    return out
  })
})

const tableColumns = computed(() => [
  { key: 'date', label: 'Data', align: 'left' as const, format: 'raw' as const, sortable: true },
  ...[...primaryDefs.value, ...detailDefs.value].map(def => ({
    key: def.key,
    label: def.label,
    align: 'right' as const,
    format: def.format,
    sortable: true,
  })),
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="loading" class="grid gap-4 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-28 rounded-lg" />
    </div>

    <div
      v-else-if="block?.error"
      class="border border-destructive/30 rounded-xl bg-destructive/5 p-6 text-sm text-destructive"
    >
      {{ userFacingError }}
    </div>

    <div
      v-else-if="!block?.connected"
      class="border rounded-xl border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      Conecte a integração Meta em
      <NuxtLink to="/settings/integrations" class="text-primary underline-offset-4 hover:underline">
        Integrações
      </NuxtLink>
      para ver métricas orgânicas de {{ platformLabel }}.
    </div>

    <template v-else-if="block">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold tracking-tight">
          {{ block.account.name }}
        </h2>
        <p v-if="block.account.username" class="text-sm text-muted-foreground">
          @{{ block.account.username }}
        </p>
        <p v-if="periodLabel" class="text-xs text-muted-foreground">
          {{ periodLabel }}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <ReportKpiCard
          v-for="def in primaryDefs"
          :key="def.key"
          :label="def.label"
          :value="readMetricBag(block.metrics, def.key)"
          :format="def.format"
          :delta="block.deltas?.[def.key]"
          :sparkline="block.series.map(row => Number(row[def.key] || 0))"
        />
      </div>

      <div v-if="block.series.length && chartSeries.length" class="border rounded-xl bg-card p-4">
        <p class="mb-4 text-sm font-medium">
          Tendência — {{ chartSeries[0].label }}
        </p>
        <ReportTrendChart
          :data="block.series"
          :series="chartSeries"
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
        <ReportKpiCard
          v-for="def in detailDefs"
          :key="def.key"
          :label="def.label"
          :value="readMetricBag(block.metrics, def.key)"
          :format="def.format"
          :delta="block.deltas?.[def.key]"
          size="detail"
          muted
        />
      </div>

      <div class="border rounded-xl bg-card p-4">
        <p class="mb-4 text-sm font-medium">
          Detalhamento diário
        </p>
        <ReportInsightTable
          :columns="tableColumns"
          :rows="tableRows"
          empty-text="Sem dados orgânicos neste período."
        />
      </div>
    </template>
  </div>
</template>
