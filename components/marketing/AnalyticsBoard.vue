<script setup lang="ts">
import type { ReportTableColumn } from '@/components/marketing/ReportInsightTable.vue'
import type { MarketingOverviewPeriod } from '~/types/marketing'
import type {
  AnalyticsOverviewBlock,
  AnalyticsReportTemplateId,
  AnalyticsSeriesPoint,
} from '~/types/marketing-reports'

import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import ReportTrendChart from '@/components/marketing/ReportTrendChart.vue'
import {
  formatReportMetricValue,
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'
import {
  detailMetricsOf,
  getReportTemplate,
  primaryMetricsOf,
} from '~/constants/marketing-report-templates'
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'

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
const userFacingError = computed(() =>
  props.analytics?.error ? toUserFacingReportError(props.analytics.error) : '',
)

const metrics = computed(() => props.analytics?.metrics)
const deltas = computed(() => props.analytics?.deltas || null)
const series = computed(() => props.analytics?.series ?? [])
const breakdown = computed(() => props.analytics?.breakdown ?? [])
const pages = computed(() => props.analytics?.pages ?? [])
const devices = computed(() => props.analytics?.devices ?? [])
const events = computed(() => props.analytics?.events ?? [])

const hasEcommerce = computed(() =>
  (metrics.value?.purchaseRevenue || 0) > 0
  || (metrics.value?.ecommercePurchases || 0) > 0,
)

function invertKey(key: string) {
  return key === 'bounceRate' || key.includes('cost') || key === 'cpc'
}

function metricFormat(key: string) {
  if (key === 'averageSessionDuration')
    return 'duration' as const
  const def = template.value.metrics.find(d => d.key === key)
  return def?.format || 'integer'
}

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
  return v > 0 ? [v * 0.9, v * 0.95, v] : []
}

const trendData = computed(() =>
  series.value.map(p => ({
    date: p.date,
    usuarios: p.totalUsers,
    sessoes: p.sessions,
    pageviews: p.screenPageViews,
  })),
)

const channelColumns: ReportTableColumn[] = [
  { key: 'dimension', label: 'Canal', format: 'raw' },
  { key: 'sessions', label: 'Sessões', align: 'right', format: 'integer' },
  { key: 'totalUsers', label: 'Usuários', align: 'right', format: 'integer' },
  { key: 'engagementRate', label: 'Engajamento', align: 'right', format: 'percent' },
  { key: 'conversions', label: 'Eventos-chave', align: 'right', format: 'decimal' },
]

const pageColumns: ReportTableColumn[] = [
  { key: 'dimension', label: 'Página', format: 'raw' },
  { key: 'sessions', label: 'Sessões', align: 'right', format: 'integer' },
  { key: 'screenPageViews', label: 'Visualizações', align: 'right', format: 'integer' },
  { key: 'totalUsers', label: 'Usuários', align: 'right', format: 'integer' },
  { key: 'conversions', label: 'Eventos-chave', align: 'right', format: 'decimal' },
]

const deviceColumns: ReportTableColumn[] = [
  { key: 'dimension', label: 'Dispositivo', format: 'raw' },
  { key: 'sessions', label: 'Sessões', align: 'right', format: 'integer' },
  { key: 'totalUsers', label: 'Usuários', align: 'right', format: 'integer' },
  { key: 'engagementRate', label: 'Engajamento', align: 'right', format: 'percent' },
  { key: 'conversions', label: 'Eventos-chave', align: 'right', format: 'decimal' },
]

const eventColumns: ReportTableColumn[] = [
  { key: 'name', label: 'Evento', format: 'raw' },
  { key: 'keyEvents', label: 'Eventos-chave', align: 'right', format: 'integer' },
  { key: 'eventCount', label: 'Total de eventos', align: 'right', format: 'integer' },
]

const deviceShareRows = computed(() => {
  const total = devices.value.reduce((s, d) => s + (d.sessions || 0), 0) || 1
  return devices.value.map(d => ({
    ...d,
    share: ((d.sessions || 0) / total) * 100,
  }))
})

const durationLabel = computed(() => {
  const n = Number(metrics.value?.averageSessionDuration || 0)
  if (!n)
    return '—'
  const total = Math.round(n)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})

const bounceLabel = computed(() =>
  formatReportMetricValue(metrics.value?.bounceRate, 'percent'),
)

const pageviewsPerSession = computed(() => {
  const sessions = metrics.value?.sessions || 0
  const views = metrics.value?.screenPageViews || 0
  if (!sessions)
    return '—'
  return formatReportMetricValue(views / sessions, 'decimal')
})
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="border-b">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle class="flex items-center gap-2 text-base font-semibold">
            <span class="h-9 w-9 flex items-center justify-center border rounded-md bg-muted/40">
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
            <span v-if="deltas" class="text-muted-foreground"> · vs período anterior</span>
          </CardDescription>
          <p
            v-if="analytics?.property_id"
            class="mt-1 text-xs text-muted-foreground"
          >
            Propriedade {{ analytics.property_id }}
          </p>
          <p
            v-if="analytics?.error"
            class="mt-2 text-xs text-destructive"
          >
            {{ userFacingError }}
          </p>
          <p
            v-else-if="analytics && !analytics.connected"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Integração não conectada. Configure o Google Analytics em Integrações.
          </p>
          <p
            v-else-if="analytics?.needs_property"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Selecione a propriedade GA4 em Integrações para carregar os relatórios.
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="p-4 space-y-4 sm:p-6">
        <div class="grid gap-4 lg:grid-cols-3">
          <div v-for="n in 3" :key="`a-sk-${n}`" class="border rounded-lg p-4 space-y-3">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-28" />
            <Skeleton class="h-10 w-full" />
          </div>
        </div>
        <Skeleton class="h-[220px] w-full rounded-lg" />
      </div>

      <template v-else>
        <div
          v-if="analytics?.error"
          class="px-4 py-8 text-center text-sm text-destructive sm:px-6"
        >
          {{ userFacingError }}
        </div>

        <template v-else>
          <!-- Primary KPIs -->
          <div class="border-b px-4 py-4 sm:px-6">
            <div class="grid gap-4 lg:grid-cols-3">
              <ReportKpiCard
                v-for="item in primaryDefs"
                :key="item.key"
                :label="item.label"
                :value="readMetricBag(metrics as any, item.key)"
                :format="metricFormat(item.key)"
                :delta="deltas?.[item.key] ?? null"
                :invert-delta="invertKey(item.key)"
                :sparkline="valuesFromSeries(item.key)"
                :muted="item.muted"
                size="primary"
              />
            </div>
          </div>

          <!-- Detail KPIs -->
          <div class="border-b px-4 py-4 sm:px-6">
            <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
              Detalhamento
            </p>
            <div class="grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
              <ReportKpiCard
                v-for="item in detailDefs"
                :key="item.key"
                :label="item.label"
                :value="readMetricBag(metrics as any, item.key)"
                :format="metricFormat(item.key)"
                :delta="deltas?.[item.key] ?? null"
                :invert-delta="invertKey(item.key)"
                :sparkline="valuesFromSeries(item.key)"
                :muted="item.muted"
                size="detail"
              />
            </div>
          </div>

          <!-- Trend -->
          <div v-if="trendData.length" class="border-b px-4 py-4 sm:px-6">
            <div class="mb-3 flex items-end justify-between gap-2">
              <div>
                <p class="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                  Evolução diária
                </p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  Usuários, sessões e pageviews no período
                </p>
              </div>
            </div>
            <ReportTrendChart
              :data="trendData"
              index="date"
              :series="[
                { key: 'usuarios', label: 'Usuários' },
                { key: 'sessoes', label: 'Sessões' },
                { key: 'pageviews', label: 'Pageviews' },
              ]"
              :height="240"
            />
          </div>

          <!-- Secondary insight strip -->
          <div class="border-b px-4 py-4 sm:px-6">
            <div class="grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
              <div class="border rounded-lg bg-muted/20 px-3 py-3">
                <p class="text-xs text-muted-foreground">
                  Duração média
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ durationLabel }}
                </p>
              </div>
              <div class="border rounded-lg bg-muted/20 px-3 py-3">
                <p class="text-xs text-muted-foreground">
                  Taxa de rejeição
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ bounceLabel }}
                </p>
              </div>
              <div class="border rounded-lg bg-muted/20 px-3 py-3">
                <p class="text-xs text-muted-foreground">
                  Páginas / sessão
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ pageviewsPerSession }}
                </p>
              </div>
              <div class="border rounded-lg bg-muted/20 px-3 py-3">
                <p class="text-xs text-muted-foreground">
                  {{ hasEcommerce ? 'Receita' : 'Eventos-chave' }}
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  <template v-if="hasEcommerce">
                    {{ formatReportMetricValue(metrics?.purchaseRevenue, 'currency') }}
                  </template>
                  <template v-else>
                    {{ formatReportMetricValue(metrics?.conversions, 'decimal') }}
                  </template>
                </p>
                <p v-if="hasEcommerce" class="mt-0.5 text-xs text-muted-foreground">
                  {{ formatReportMetricValue(metrics?.ecommercePurchases, 'integer') }} compras
                </p>
              </div>
            </div>
          </div>

          <!-- Channels -->
          <div class="border-b px-4 py-4 sm:px-6">
            <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
              Por canal de aquisição
            </p>
            <ReportInsightTable
              :columns="channelColumns"
              :rows="breakdown as any"
              empty-text="Sem dados de canais neste período."
            />
          </div>

          <!-- Pages + Devices -->
          <div class="grid gap-0 border-b lg:grid-cols-2">
            <div class="border-b px-4 py-4 lg:border-b-0 lg:border-r sm:px-6">
              <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Top páginas
              </p>
              <ReportInsightTable
                :columns="pageColumns"
                :rows="pages as any"
                :max-rows="10"
                empty-text="Sem dados de páginas."
              />
            </div>
            <div class="px-4 py-4 sm:px-6">
              <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Dispositivos
              </p>
              <ReportInsightTable
                :columns="deviceColumns"
                :rows="deviceShareRows as any"
                empty-text="Sem dados de dispositivos."
              />
            </div>
          </div>

          <!-- Events -->
          <div v-if="events.length" class="px-4 py-4 sm:px-6">
            <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
              Eventos-chave
            </p>
            <ReportInsightTable
              :columns="eventColumns"
              :rows="events as any"
              :max-rows="10"
              empty-text="Sem eventos-chave no período."
            />
          </div>

          <div
            v-else-if="analytics?.connected && !series.length && !breakdown.length"
            class="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6"
          >
            Sem dados no período selecionado para esta propriedade.
          </div>
        </template>
      </template>
    </CardContent>
  </Card>
</template>
