<script setup lang="ts">
import type { ReportTableColumn } from '@/components/marketing/ReportInsightTable.vue'
import type { MarketingOverviewPeriod } from '~/types/marketing'
import type { MarketingReportLayoutJson } from '~/types/marketing-report-layout'
import type {
  GoogleAdsOverviewBlock,
  GoogleAdsReportTemplateId,
  GoogleAdsSeriesPoint,
} from '~/types/marketing-reports'

import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import ReportTrendChart from '@/components/marketing/ReportTrendChart.vue'
import {
  formatReportMetricValue,
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'
import {
  getReportTemplate,
} from '~/constants/marketing-report-templates'
import {
  googleAdsConversionEmptyMessage,
  pickGoogleAdsConversionActionsForScope,
  pickGoogleAdsSeriesForScope,
} from '~/lib/marketing/google-ads-report-scope'
import {
  buildDefaultReportLayout,
  normalizeReportLayout,
  resolveBlockMetricDefs,
} from '~/lib/marketing/report-layout'
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'

const props = defineProps<{
  google?: GoogleAdsOverviewBlock | null
  period?: MarketingOverviewPeriod | null
  templateId?: GoogleAdsReportTemplateId | string
  loading?: boolean
  /** Custom layout (tenant); defaults to template catalog layout */
  layout?: MarketingReportLayoutJson | null
}>()

const emit = defineEmits<{
  'campaign-change': [payload: { campaignId: string | 'all', channel: string | null }]
}>()

const selectedCampaignId = ref<string | 'all'>('all')
const activeCampaignsOnly = ref(true)
const showAllConversions = ref(false)

const template = computed(() =>
  getReportTemplate('google_ads', props.templateId || 'overview'),
)

const effectiveLayout = computed(() => {
  const baseId = props.templateId || 'overview'
  if (props.layout)
    return normalizeReportLayout('google_ads', baseId, props.layout)
  return buildDefaultReportLayout('google_ads', baseId)
})

const visibleBlocks = computed(() =>
  effectiveLayout.value.blocks.filter(b => b.enabled !== false),
)

function metricDefsForBlock(block: { type: string, metricKeys?: string[] }) {
  if (block.type === 'kpi_primary')
    return resolveBlockMetricDefs(template.value.metrics, block.metricKeys, 'primary')
  if (block.type === 'kpi_detail')
    return resolveBlockMetricDefs(template.value.metrics, block.metricKeys, 'detail')
  return []
}

const periodLabel = computed(() => periodLabelPt(props.period))
const deltas = computed(() =>
  selectedCampaignId.value === 'all' ? (props.google?.deltas || null) : null,
)

const userFacingError = computed(() => {
  if (!props.google?.error)
    return ''
  return toUserFacingReportError(props.google.error)
})

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

/** Series aligned with KPI scope (campaign or template-filtered account). */
const scopedSeries = computed(() =>
  pickGoogleAdsSeriesForScope({
    series: props.google?.series,
    seriesByCampaign: props.google?.series_by_campaign,
    campaignId: selectedCampaignId.value,
  }),
)

const scopedConversionActions = computed(() =>
  pickGoogleAdsConversionActionsForScope({
    actions: props.google?.conversion_actions,
    campaignId: selectedCampaignId.value,
    allowedCampaignIds: campaigns.value.map(c => c.id),
  }),
)

const configuredConversionCount = computed(
  () => props.google?.conversion_actions_configured?.length ?? 0,
)

const conversionActionsHaveData = computed(() => {
  return scopedConversionActions.value.some((row) => {
    if (showAllConversions.value)
      return row.all_conversions > 0 || row.all_conversions_value > 0
    return row.conversions > 0 || row.conversions_value > 0
  })
})

const conversionEmptyText = computed(() =>
  googleAdsConversionEmptyMessage({
    campaignId: selectedCampaignId.value,
    configuredCount: configuredConversionCount.value,
    conversionsTotal: displayMetrics.value.conversions,
    allConversionsTotal: scopedConversionActions.value.reduce(
      (sum, row) => sum + Number(row.all_conversions || 0),
      0,
    ),
  }),
)

function invertKey(key: string) {
  return key.includes('cost') || key === 'cpc' || key === 'cpm'
}

function valuesFromSeries(key: keyof GoogleAdsSeriesPoint | 'ctr' | 'cpc' | 'cost_per_conversion' | 'roas'): number[] {
  const s = scopedSeries.value
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
  scopedSeries.value.map(p => ({
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

const conversionActionColumns = computed<ReportTableColumn[]>(() => {
  if (showAllConversions.value) {
    return [
      { key: 'name', label: 'Ação de conversão', format: 'raw' },
      { key: 'all_conversions', label: 'Todas as conversões', align: 'right', format: 'decimal' },
      { key: 'all_conversions_value', label: 'Valor (todas)', align: 'right', format: 'currency' },
    ]
  }
  return [
    { key: 'name', label: 'Ação de conversão', format: 'raw' },
    { key: 'conversions', label: 'Conversões', align: 'right', format: 'decimal' },
    { key: 'conversions_value', label: 'Valor', align: 'right', format: 'currency' },
  ]
})

const conversionActionRows = computed(() =>
  scopedConversionActions.value
    .filter((row) => {
      if (showAllConversions.value)
        return row.all_conversions > 0 || row.all_conversions_value > 0
      return row.conversions > 0 || row.conversions_value > 0
    })
    .map(row => ({
      ...row,
      _id: row.id || row.name,
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

watch(
  selectedCampaignId,
  (campaignId) => {
    if (campaignId === 'all') {
      emit('campaign-change', { campaignId: 'all', channel: null })
      return
    }
    const row = campaigns.value.find(c => String(c.id) === String(campaignId))
    emit('campaign-change', {
      campaignId,
      channel: row?.channel != null ? String(row.channel) : null,
    })
  },
  { immediate: true },
)
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="border-b">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle class="flex items-center gap-2 text-base font-semibold">
            <span class="h-9 w-9 flex items-center justify-center border rounded-md bg-muted/40">
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
            v-if="google?.error"
            class="mt-2 text-xs text-destructive"
          >
            {{ userFacingError }}
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

        <div class="w-full flex flex-col gap-4 lg:max-w-lg lg:shrink-0">
          <div class="flex flex-col gap-2">
            <Label for="gads-campaign" class="text-xs text-muted-foreground font-medium">
              Campanha
            </Label>
            <Select v-model="selectedCampaignId">
              <SelectTrigger id="gads-campaign" class="min-w-0 w-full">
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
            class="flex items-center justify-between gap-3 border border-border/70 rounded-xl bg-muted/25 px-3 py-2.5 shadow-sm"
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
      <div v-if="loading" class="p-4 space-y-4 sm:p-6">
        <div class="grid gap-4 lg:grid-cols-3">
          <div v-for="n in 3" :key="`g-sk-p-${n}`" class="border rounded-lg p-4 space-y-3">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-32" />
            <Skeleton class="h-10 w-full" />
          </div>
        </div>
        <Skeleton class="h-[220px] w-full rounded-lg" />
      </div>

      <template v-else>
        <div
          v-if="google?.error"
          class="px-4 py-8 text-center text-sm text-destructive sm:px-6"
        >
          {{ userFacingError }}
        </div>

        <template v-else>
          <template v-for="(block, blockIndex) in visibleBlocks" :key="block.id">
            <div
              v-if="block.type === 'kpi_primary'"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <div class="grid gap-4 lg:grid-cols-3">
                <ReportKpiCard
                  v-for="item in metricDefsForBlock(block)"
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

            <div
              v-else-if="block.type === 'kpi_detail'"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
                {{ block.title || 'Detalhamento' }}
              </p>
              <div class="grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
                <ReportKpiCard
                  v-for="item in metricDefsForBlock(block)"
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

            <div
              v-else-if="block.type === 'trend_chart' && trendData.length"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <div class="mb-3">
                <p class="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                  {{ block.title || 'Investimento vs resultados' }}
                </p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  <template v-if="selectedCampaignId === 'all'">
                    Custo diário, cliques e conversões (escopo do modelo)
                  </template>
                  <template v-else>
                    Custo diário, cliques e conversões da campanha selecionada
                  </template>
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
              v-else-if="block.type === 'conversions_table'"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                    {{ block.title || 'Conversões por ação' }}
                  </p>
                  <p class="mt-0.5 text-sm text-muted-foreground">
                    <template v-if="showAllConversions">
                      Todas as conversões (inclui ações secundárias / não primárias)
                    </template>
                    <template v-else>
                      Conversões primárias por ação de conversão
                    </template>
                  </p>
                </div>
                <div
                  class="flex items-center justify-between gap-3 border border-border/70 rounded-xl bg-muted/25 px-3 py-2.5 shadow-sm sm:min-w-[240px]"
                >
                  <Label for="gads-all-conv" class="cursor-pointer text-sm font-medium">
                    Incluir todas as conversões
                  </Label>
                  <Switch id="gads-all-conv" v-model:checked="showAllConversions" />
                </div>
              </div>

              <ReportInsightTable
                v-if="conversionActionsHaveData"
                :columns="conversionActionColumns"
                :rows="conversionActionRows as any"
                :max-rows="40"
                empty-text="Nenhuma conversão no período"
              />
              <div
                v-else
                class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
              >
                {{ conversionEmptyText }}
              </div>
            </div>

            <div
              v-else-if="block.type === 'networks_table' && networkRows.length > 1"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
                {{ block.title || 'Por tipo de campanha' }}
              </p>
              <ReportInsightTable
                :columns="networkColumns"
                :rows="networkRows as any"
                empty-text="Sem breakdown por canal."
              />
            </div>

            <div
              v-else-if="block.type === 'campaigns_table' || block.type === 'insights'"
              class="border-b px-4 py-4 sm:px-6"
              :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
            >
              <p class="mb-3 text-xs text-muted-foreground font-medium tracking-wide uppercase">
                {{ block.title || (block.type === 'insights' ? 'Insights' : 'Campanhas') }}
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
      </template>
    </CardContent>
  </Card>
</template>
