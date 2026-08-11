<script setup lang="ts">
import type {
  GoogleAdsOverviewBlock,
  GoogleAdsReportTemplateId,
  GoogleAdsSeriesPoint,
} from '~/types/marketing-reports'
import type { MarketingOverviewPeriod } from '~/types/marketing'
import type { ReportTableColumn } from '@/components/marketing/ReportInsightTable.vue'

import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import GoogleAdsTestTokenNotice from '@/components/marketing/GoogleAdsTestTokenNotice.vue'
import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import ReportTrendChart from '@/components/marketing/ReportTrendChart.vue'
import {
  detailMetricsOf,
  getReportTemplate,
  primaryMetricsOf,
} from '~/constants/marketing-report-templates'
import { isGoogleAdsTestTokenUserMessage } from '~/constants/google-ads'
import {
  formatReportMetricValue,
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'

const props = defineProps<{
  google?: GoogleAdsOverviewBlock | null
  period?: MarketingOverviewPeriod | null
  templateId?: GoogleAdsReportTemplateId | string
  loading?: boolean
}>()

const selectedCampaignId = ref<string | 'all'>('all')
const activeCampaignsOnly = ref(true)

const template = computed(() =>
  getReportTemplate('google_ads', props.templateId || 'overview'),
)
const primaryDefs = computed(() => primaryMetricsOf(template.value))
const detailDefs = computed(() => detailMetricsOf(template.value))

const periodLabel = computed(() => periodLabelPt(props.period))
const deltas = computed(() =>
  selectedCampaignId.value === 'all' ? (props.google?.deltas || null) : null,
)

const isTestTokenError = computed(() =>
  isGoogleAdsTestTokenUserMessage(props.google?.error),
)

const campaigns = computed(() => props.google?.campaigns ?? [])
const networks = computed(() => props.google?.networks ?? [])

const campaignSelectOptions = computed(() => {
  let list = [...campaigns.value]
  if (activeCampaignsOnly.value) {
    list = list.filter((c) => {
      const status = String(c.status || '').toUpperCase()
      if (!status)
        return true
      return status === 'ENABLED' || status === 'ACTIVE'
    })
  }
  return list
})

const displayMetrics = computed(() => {
  const m = props.google?.metrics
  if (!m) {
    return {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversions_value: 0,
      ctr: 0,
      cpc: 0,
      cost_per_conversion: null as number | null,
      roas: null as number | null,
    }
  }
  if (selectedCampaignId.value === 'all')
    return m

  const row = campaigns.value.find(c => String(c.id) === String(selectedCampaignId.value))
  if (!row)
    return m
  return {
    impressions: row.impressions,
    clicks: row.clicks,
    cost: row.cost,
    conversions: row.conversions,
    conversions_value: row.conversions_value,
    ctr: row.ctr,
    cpc: row.cpc,
    cost_per_conversion: row.cost_per_conversion,
    roas: row.cost > 0 && row.conversions_value > 0 ? row.conversions_value / row.cost : null,
  }
})

const accountSeries = computed(() => props.google?.series ?? [])

function invertKey(key: string) {
  return key.includes('cost') || key === 'cpc' || key === 'cpm'
}

function valuesFromSeries(key: keyof GoogleAdsSeriesPoint | 'ctr' | 'cpc' | 'cost_per_conversion' | 'roas'): number[] {
  const s = accountSeries.value
  if (s.length >= 2) {
    return s.map((p) => {
      if (key in p)
        return Number((p as unknown as Record<string, number>)[key as string] || 0)
      if (key === 'ctr')
        return p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0
      if (key === 'cpc')
        return p.clicks > 0 ? p.cost / p.clicks : 0
      if (key === 'cost_per_conversion')
        return p.conversions > 0 ? p.cost / p.conversions : 0
      if (key === 'roas')
        return p.cost > 0 ? p.conversions_value / p.cost : 0
      return 0
    })
  }
  const m = displayMetrics.value as Record<string, number | null>
  const v = Number(m[key] || 0) || 0
  return v > 0 ? [v * 0.9, v * 0.95, v] : []
}

function statusPt(status: string | null | undefined) {
  if (!status)
    return ''
  const map: Record<string, string> = {
    ENABLED: 'Ativa',
    PAUSED: 'Pausada',
    REMOVED: 'Removida',
    ACTIVE: 'Ativa',
  }
  return map[status.toUpperCase()] || status
}

function channelPt(channel: string | null | undefined) {
  if (!channel)
    return ''
  const map: Record<string, string> = {
    SEARCH: 'Pesquisa',
    PERFORMANCE_MAX: 'Performance Max',
    SHOPPING: 'Shopping',
    DEMAND_GEN: 'Demand Gen',
    DISPLAY: 'Display',
    LOCAL: 'Local',
    LOCAL_SERVICES: 'Serviços locais',
    VIDEO: 'Vídeo',
    UNKNOWN: 'Outro',
  }
  return map[channel.toUpperCase()] || channel
}

const trendData = computed(() =>
  accountSeries.value.map(p => ({
    date: p.date,
    investimento: Number(p.cost.toFixed(2)),
    conversoes: p.conversions,
    cliques: p.clicks,
  })),
)

const campaignRows = computed(() =>
  campaignSelectOptions.value.map(c => ({
    ...c,
    _id: c.id,
    channel_label: channelPt(c.channel),
    status_label: statusPt(c.status),
  })),
)

const campaignColumns: ReportTableColumn[] = [
  { key: 'name', label: 'Campanha', format: 'raw' },
  { key: 'channel_label', label: 'Tipo', format: 'raw' },
  { key: 'impressions', label: 'Impressões', align: 'right', format: 'integer' },
  { key: 'clicks', label: 'Cliques', align: 'right', format: 'integer' },
  { key: 'ctr', label: 'CTR', align: 'right', format: 'percent' },
  { key: 'cpc', label: 'CPC', align: 'right', format: 'currency' },
  { key: 'cost', label: 'Custo', align: 'right', format: 'currency' },
  { key: 'conversions', label: 'Conversões', align: 'right', format: 'decimal' },
  { key: 'cost_per_conversion', label: 'CPA', align: 'right', format: 'currency' },
]

const networkColumns: ReportTableColumn[] = [
  { key: 'network_label', label: 'Canal', format: 'raw' },
  { key: 'impressions', label: 'Impressões', align: 'right', format: 'integer' },
  { key: 'clicks', label: 'Cliques', align: 'right', format: 'integer' },
  { key: 'ctr', label: 'CTR', align: 'right', format: 'percent' },
  { key: 'cost', label: 'Custo', align: 'right', format: 'currency' },
  { key: 'conversions', label: 'Conversões', align: 'right', format: 'decimal' },
  { key: 'cost_per_conversion', label: 'CPA', align: 'right', format: 'currency' },
]

const networkRows = computed(() =>
  networks.value.map(n => ({
    ...n,
    _id: n.network,
    network_label: channelPt(n.network),
  })),
)

watch(
  () => campaigns.value.map(c => c.id).join(','),
  () => {
    if (
      selectedCampaignId.value !== 'all'
      && !campaigns.value.some(c => String(c.id) === String(selectedCampaignId.value))
    ) {
      selectedCampaignId.value = 'all'
    }
  },
)

watch(activeCampaignsOnly, () => {
  if (selectedCampaignId.value === 'all')
    return
  if (!campaignSelectOptions.value.some(c => String(c.id) === String(selectedCampaignId.value)))
    selectedCampaignId.value = 'all'
})
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="border-b">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle class="flex items-center gap-2 text-base font-semibold">
            <span class="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/40">
              <GoogleAdsBrandIcon size="sm" />
            </span>
            Google Ads
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
            v-if="google?.customer_id"
            class="mt-1 text-xs text-muted-foreground"
          >
            Conta {{ google.customer_id }}
          </p>
          <p
            v-if="google?.error && !isTestTokenError"
            class="mt-2 text-xs text-destructive"
          >
            {{ google.error }}
          </p>
          <p
            v-else-if="isTestTokenError"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Token da plataforma em modo teste — veja o aviso abaixo.
          </p>
          <p
            v-else-if="google && !google.connected"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Integração não conectada. Configure o Google Ads em Integrações.
          </p>
          <p
            v-else-if="google?.needs_account"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Selecione a conta de anúncios em Integrações para carregar os relatórios.
          </p>
        </div>

        <div class="flex w-full flex-col gap-4 lg:max-w-lg lg:shrink-0">
          <div class="flex flex-col gap-2">
            <Label for="gads-campaign" class="text-xs font-medium text-muted-foreground">
              Campanha
            </Label>
            <Select v-model="selectedCampaignId">
              <SelectTrigger id="gads-campaign" class="w-full min-w-0">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todas
                </SelectItem>
                <SelectItem
                  v-for="c in campaignSelectOptions"
                  :key="String(c.id)"
                  :value="String(c.id)"
                >
                  {{ c.name || c.id }}
                  <span v-if="c.channel" class="text-muted-foreground"> · {{ channelPt(c.channel) }}</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 shadow-sm"
          >
            <Label for="gads-active" class="cursor-pointer text-sm font-medium">
              Campanhas ativas
            </Label>
            <Switch id="gads-active" v-model:checked="activeCampaignsOnly" />
          </div>
        </div>
      </div>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="space-y-4 p-4 sm:p-6">
        <div class="grid gap-4 lg:grid-cols-3">
          <div v-for="n in 3" :key="`g-sk-p-${n}`" class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-32" />
            <Skeleton class="h-10 w-full" />
          </div>
        </div>
        <Skeleton class="h-[220px] w-full rounded-lg" />
      </div>

      <template v-else>
        <div
          v-if="google?.error && isTestTokenError"
          class="px-4 py-6 sm:px-6"
        >
          <GoogleAdsTestTokenNotice :message="google.error || undefined" />
        </div>
        <div
          v-else-if="google?.error"
          class="px-4 py-8 text-center text-sm text-destructive sm:px-6"
        >
          {{ google.error }}
        </div>

        <template v-else>
          <div class="border-b px-4 py-4 sm:px-6">
            <div class="grid gap-4 lg:grid-cols-3">
              <ReportKpiCard
                v-for="item in primaryDefs"
                :key="item.key"
                :label="item.label"
                :value="readMetricBag(displayMetrics as any, item.key)"
                :format="item.format"
                :delta="deltas?.[item.key] ?? null"
                :invert-delta="invertKey(item.key)"
                :sparkline="valuesFromSeries(item.key as any)"
                :muted="item.muted"
                size="primary"
              />
            </div>
          </div>

          <div class="border-b px-4 py-4 sm:px-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Detalhamento
            </p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ReportKpiCard
                v-for="item in detailDefs"
                :key="item.key"
                :label="item.label"
                :value="readMetricBag(displayMetrics as any, item.key)"
                :format="item.format"
                :delta="deltas?.[item.key] ?? null"
                :invert-delta="invertKey(item.key)"
                :sparkline="valuesFromSeries(item.key as any)"
                :muted="item.muted"
                size="detail"
              />
            </div>
          </div>

          <div v-if="trendData.length" class="border-b px-4 py-4 sm:px-6">
            <div class="mb-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Investimento vs resultados
              </p>
              <p class="mt-0.5 text-sm text-muted-foreground">
                Custo diário, cliques e conversões
              </p>
            </div>
            <ReportTrendChart
              :data="trendData"
              index="date"
              :series="[
                { key: 'investimento', label: 'Investimento (R$)' },
                { key: 'cliques', label: 'Cliques' },
                { key: 'conversoes', label: 'Conversões' },
              ]"
              :height="240"
              :y-formatter="(v) => formatReportMetricValue(v, v >= 100 ? 'integer' : 'decimal')"
            />
          </div>

          <div
            v-if="networkRows.length > 1"
            class="border-b px-4 py-4 sm:px-6"
          >
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Por tipo de campanha
            </p>
            <ReportInsightTable
              :columns="networkColumns"
              :rows="networkRows as any"
              empty-text="Sem breakdown por canal."
            />
          </div>

          <div class="px-4 py-4 sm:px-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Campanhas
            </p>
            <ReportInsightTable
              :columns="campaignColumns"
              :rows="campaignRows as any"
              :max-rows="40"
              empty-text="Sem dados de campanha neste modelo/período."
            >
              <template #cell-name="{ row }">
                <button
                  type="button"
                  class="text-left font-medium hover:underline"
                  @click="selectedCampaignId = String(row.id)"
                >
                  {{ row.name || row.id }}
                </button>
                <p v-if="row.status_label" class="text-xs text-muted-foreground">
                  {{ row.status_label }}
                </p>
              </template>
            </ReportInsightTable>
          </div>
        </template>
      </template>
    </CardContent>
  </Card>
</template>
