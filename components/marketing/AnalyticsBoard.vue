<script setup lang="ts">
import type {
  AnalyticsOverviewBlock,
  AnalyticsReportTemplateId,
  AnalyticsSeriesPoint,
} from '~/types/marketing-reports'
import type { MarketingOverviewPeriod } from '~/types/marketing'

import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import MiniSparkline from '@/components/marketing/MiniSparkline.vue'
import {
  detailMetricsOf,
  getReportTemplate,
  primaryMetricsOf,
} from '~/constants/marketing-report-templates'
import {
  formatReportMetricValue,
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'

const props = defineProps<{
  analytics?: AnalyticsOverviewBlock | null
  period?: MarketingOverviewPeriod | null
  templateId?: AnalyticsReportTemplateId | string
  loading?: boolean
}>()

const template = computed(() =>
  getReportTemplate('google_analytics', props.templateId || 'overview'),
)
const primaryDefs = computed(() => primaryMetricsOf(template.value))
const detailDefs = computed(() => detailMetricsOf(template.value))
const periodLabel = computed(() => periodLabelPt(props.period))

const metrics = computed(() => props.analytics?.metrics)
const series = computed(() => props.analytics?.series ?? [])
const breakdown = computed(() => props.analytics?.breakdown ?? [])

function valuesFromSeries(key: string): number[] {
  const s = series.value
  if (s.length >= 2) {
    return s.map((p: AnalyticsSeriesPoint) => {
      const map: Record<string, number> = {
        sessions: p.sessions,
        totalUsers: p.totalUsers,
        screenPageViews: p.screenPageViews,
        engagementRate: p.engagementRate,
        conversions: p.conversions,
        purchaseRevenue: p.purchaseRevenue,
      }
      if (key in map)
        return map[key] || 0
      return Number((metrics.value as any)?.[key] || 0)
    })
  }
  const v = Number((metrics.value as any)?.[key] || 0) || 0
  return [v * 0.88, v * 0.94, v * 0.97, v, v * 1.02]
}

function fmt(key: string) {
  const def = template.value.metrics.find(d => d.key === key)
  return formatReportMetricValue(readMetricBag(metrics.value as any, key), def?.format || 'integer')
}
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="border-b">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle class="flex items-center gap-2 text-base font-semibold">
            <span class="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/40">
              <GoogleAnalyticsBrandIcon size="sm" />
            </span>
            Google Analytics
            <Badge v-if="template.label" variant="secondary" class="font-normal">
              {{ template.label }}
            </Badge>
          </CardTitle>
          <CardDescription class="mt-1">
            <span v-if="periodLabel">Desempenho · {{ periodLabel }}</span>
            <span v-else>{{ template.description }}</span>
          </CardDescription>
          <p
            v-if="analytics?.property_id"
            class="mt-1 text-xs text-muted-foreground"
          >
            Propriedade {{ analytics.property_id }}
          </p>
          <p
            v-if="analytics && !analytics.connected"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Integração não conectada ou sem property_id. Configure o Google Analytics em Integrações.
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="space-y-4 p-4 sm:p-6">
        <div class="grid gap-4 lg:grid-cols-3">
          <div v-for="n in 3" :key="`a-sk-${n}`" class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-28" />
          </div>
        </div>
      </div>

      <template v-else>
        <div class="border-b px-4 py-4 sm:px-6">
          <div class="grid gap-4 lg:grid-cols-3">
            <div
              v-for="item in primaryDefs"
              :key="item.key"
              class="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4"
            >
              <div>
                <p class="text-xs font-medium text-muted-foreground">
                  {{ item.label }}
                </p>
                <p class="mt-1 text-2xl font-semibold tabular-nums">
                  {{ fmt(item.key) }}
                </p>
              </div>
              <MiniSparkline
                :tone="item.muted ? 'muted' : 'primary'"
                :values="valuesFromSeries(item.key)"
              />
            </div>
          </div>
        </div>

        <div class="border-b px-4 py-4 sm:px-6">
          <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Detalhamento
          </p>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="item in detailDefs"
              :key="item.key"
              class="flex min-h-[100px] flex-col justify-between gap-2 rounded-lg border bg-card p-3"
            >
              <div>
                <p class="text-xs font-medium text-muted-foreground">
                  {{ item.label }}
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ fmt(item.key) }}
                </p>
              </div>
              <MiniSparkline
                :tone="item.muted ? 'muted' : 'primary'"
                :values="valuesFromSeries(item.key)"
              />
            </div>
          </div>
        </div>

        <div v-if="breakdown.length" class="px-4 py-4 sm:px-6">
          <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Por canal de aquisição
          </p>
          <div class="overflow-x-auto rounded-lg border">
            <table class="w-full min-w-[520px] text-left text-sm">
              <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Canal
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Sessões
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Usuários
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Engajamento
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Eventos-chave
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in breakdown"
                  :key="row.dimension"
                  class="border-b last:border-0"
                >
                  <td class="px-3 py-2 font-medium">
                    {{ row.dimension }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(row.sessions, 'integer') }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(row.totalUsers, 'integer') }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(row.engagementRate, 'percent') }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(row.conversions, 'decimal') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-else-if="analytics?.connected && !series.length"
          class="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6"
        >
          Sem dados no período selecionado para esta propriedade.
        </div>
      </template>
    </CardContent>
  </Card>
</template>
