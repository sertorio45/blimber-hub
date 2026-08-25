<script setup lang="ts">
import type { MarketingOverviewPeriod, MetaOverviewBlock, MetaSeriesPoint } from '~/types/marketing'
import type { MarketingReportLayoutJson } from '~/types/marketing-report-layout'
import type { MetaReportTemplateId } from '~/types/marketing-reports'
import type { ReportTableColumn } from '@/components/marketing/ReportInsightTable.vue'

import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'
import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import ReportTrendChart from '@/components/marketing/ReportTrendChart.vue'
import { Switch } from '@/components/ui/switch'
import {
  getReportTemplate,
} from '~/constants/marketing-report-templates'
import {
  formatReportMetricValue,
  periodLabelPt,
  readMetricBag,
} from '~/composables/marketing/useMarketingReportMetrics'
import {
  buildDefaultReportLayout,
  normalizeReportLayout,
  resolveBlockMetricDefs,
} from '~/lib/marketing/report-layout'

const props = defineProps<{
  meta?: MetaOverviewBlock | null
  period?: MarketingOverviewPeriod | null
  loading?: boolean
  templateId?: MetaReportTemplateId | string
  layout?: MarketingReportLayoutJson | null
}>()

const emit = defineEmits<{
  'campaign-change': [payload: {
    campaignId: string | 'all'
    objective: string | null
    primaryActionType: string | null
  }]
}>()

const adsActiveOnly = defineModel<boolean>('adsActiveOnly', { default: false })

const selectedCampaignId = ref<string | 'all'>('all')
const activeCampaignsOnly = ref(true)

const template = computed(() =>
  getReportTemplate('meta', props.templateId || 'overview'),
)

const effectiveLayout = computed(() => {
  const baseId = props.templateId || 'overview'
  if (props.layout)
    return normalizeReportLayout('meta', baseId, props.layout)
  return buildDefaultReportLayout('meta', baseId)
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

function metaStatusPt(status: string | null | undefined) {
  if (!status)
    return ''
  const u = status.toUpperCase()
  const map: Record<string, string> = {
    ACTIVE: 'Ativo',
    PAUSED: 'Pausado',
    ARCHIVED: 'Arquivado',
    DELETED: 'Excluído',
    IN_PROCESS: 'Em processamento',
    WITH_ISSUES: 'Com problemas',
    DISAPPROVED: 'Reprovado',
    PENDING_REVIEW: 'Em análise',
    PREAPPROVED: 'Pré-aprovado',
    PENDING_BILLING_INFO: 'Aguardando faturamento',
    CAMPAIGN_PAUSED: 'Campanha pausada',
    ADSET_PAUSED: 'Conjunto pausado',
  }
  return map[u] || status
}

function objectivePt(objective: string | null | undefined) {
  if (!objective)
    return ''
  const map: Record<string, string> = {
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_LEADS: 'Leads',
    OUTCOME_SALES: 'Vendas',
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_APP_PROMOTION: 'App',
    BRAND_AWARENESS: 'Reconhecimento',
    REACH: 'Alcance',
    LINK_CLICKS: 'Cliques no link',
    POST_ENGAGEMENT: 'Engajamento',
    VIDEO_VIEWS: 'Visualizações',
    LEAD_GENERATION: 'Leads',
    CONVERSIONS: 'Conversões',
    MESSAGES: 'Mensagens',
    PRODUCT_CATALOG_SALES: 'Catálogo',
  }
  return map[objective.toUpperCase()] || objective
}

const campaigns = computed(() => props.meta?.campaigns ?? [])

const campaignSelectOptions = computed(() => {
  let list = [...campaigns.value]
  if (activeCampaignsOnly.value) {
    list = list.filter((c) => {
      const status = String(c.status || '').toUpperCase()
      if (!status)
        return true
      return status === 'ACTIVE'
    })
  }
  return list
})

const displayMetrics = computed(() => {
  const m = props.meta?.metrics
  if (!m) {
    return {
      impressions: 0,
      clicks: 0,
      spend: 0,
      reach: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      results: 0,
      roas: null as number | null,
      cost_per_result: 0,
    }
  }
  if (selectedCampaignId.value === 'all')
    return m

  const row = campaigns.value.find(c => String(c.id) === String(selectedCampaignId.value))
  return row
    ? {
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        reach: row.reach,
        ctr: row.ctr,
        cpc: row.cpc,
        cpm: row.cpm,
        results: row.results,
        roas: row.roas,
        cost_per_result: row.cost_per_result,
      }
    : m
})

const accountSeries = computed(() => props.meta?.series ?? [])

function valuesFromSeries(key: keyof MetaSeriesPoint | string): number[] {
  const s = accountSeries.value
  if (s.length >= 2) {
    return s.map((p) => {
      const v = (p as unknown as Record<string, unknown>)[key]
      if (typeof v === 'number')
        return v
      return v == null ? 0 : Number(v)
    })
  }
  const m = displayMetrics.value as Record<string, number | null>
  const fallback = Number(m[key] ?? 0) || 0
  return fallback > 0 ? [fallback * 0.9, fallback * 0.95, fallback] : []
}

function trendHalf(values: number[]): number | null {
  if (values.length < 4)
    return null
  const mid = Math.floor(values.length / 2)
  const a = values.slice(0, mid).reduce((s, x) => s + x, 0) / mid
  const b = values.slice(mid).reduce((s, x) => s + x, 0) / (values.length - mid)
  if (a === 0 && b === 0)
    return null
  const base = Math.abs(a) < 1e-9 ? (Math.abs(b) < 1e-9 ? 1 : b) : a
  return ((b - a) / base) * 100
}

function invertKey(key: string) {
  return key.includes('cost') || key === 'cpc' || key === 'cpm'
}

function metricValue(key: string) {
  let value = readMetricBag(displayMetrics.value as any, key)
  if (key === 'cost_per_result' && (displayMetrics.value.results || 0) <= 0)
    value = null
  if (key === 'roas' && (value == null || value <= 0))
    value = null
  return value
}

const trendData = computed(() =>
  accountSeries.value.map(p => ({
    date: p.date,
    investimento: Number(p.spend.toFixed(2)),
    resultados: p.results,
    alcance: p.reach,
  })),
)

const campaignRows = computed(() =>
  campaignSelectOptions.value.map(c => ({
    ...c,
    _id: c.id,
    objective_label: objectivePt(c.objective),
    status_label: metaStatusPt(c.status),
  })),
)

const campaignColumns: ReportTableColumn[] = [
  { key: 'name', label: 'Campanha', format: 'raw' },
  { key: 'objective_label', label: 'Objetivo', format: 'raw' },
  { key: 'spend', label: 'Investimento', align: 'right', format: 'currency' },
  { key: 'impressions', label: 'Impressões', align: 'right', format: 'integer' },
  { key: 'clicks', label: 'Cliques', align: 'right', format: 'integer' },
  { key: 'ctr', label: 'CTR', align: 'right', format: 'percent' },
  { key: 'results', label: 'Resultados', align: 'right', format: 'decimal' },
  { key: 'cost_per_result', label: 'Custo / resultado', align: 'right', format: 'currency' },
]

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
      emit('campaign-change', {
        campaignId: 'all',
        objective: null,
        primaryActionType: null,
      })
      return
    }
    const row = campaigns.value.find(c => String(c.id) === String(campaignId))
    emit('campaign-change', {
      campaignId,
      objective: row?.objective != null ? String(row.objective) : null,
      primaryActionType: row?.primary_action_type != null
        ? String(row.primary_action_type)
        : null,
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
            <span class="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/40 text-[#0866FF]">
              <MetaBrandIcon size="sm" />
            </span>
            Anúncios Meta
            <Badge v-if="template.label" variant="secondary" class="font-normal">
              {{ template.label }}
            </Badge>
          </CardTitle>
          <CardDescription class="mt-1">
            <span v-if="periodLabel">Desempenho · {{ periodLabel }}</span>
            <span v-else>{{ template.description }}</span>
          </CardDescription>
          <p
            v-if="selectedCampaignId !== 'all' && accountSeries.length"
            class="mt-2 text-xs text-muted-foreground"
          >
            Os gráficos usam dados diários da conta; os números refletem a campanha selecionada.
          </p>
        </div>

        <div class="flex w-full flex-col gap-4 lg:max-w-lg lg:shrink-0">
          <div class="flex flex-col gap-2">
            <Label for="meta-campaign" class="text-xs font-medium text-muted-foreground">
              Campanha
            </Label>
            <Select v-model="selectedCampaignId">
              <SelectTrigger id="meta-campaign" class="w-full min-w-0">
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
                  <span v-if="c.status" class="text-muted-foreground"> · {{ metaStatusPt(c.status) }}</span>
                  <span
                    v-else-if="c.objective"
                    class="text-muted-foreground"
                  > · {{ objectivePt(c.objective) }}</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            <div
              class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 shadow-sm"
            >
              <Label
                for="meta-ads-active"
                class="cursor-pointer text-sm font-medium leading-tight text-foreground"
              >
                Anúncios ativos
              </Label>
              <Switch id="meta-ads-active" v-model:checked="adsActiveOnly" />
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 shadow-sm"
            >
              <Label
                for="meta-campaigns-active"
                class="cursor-pointer text-sm font-medium leading-tight text-foreground"
              >
                Campanhas ativas
              </Label>
              <Switch id="meta-campaigns-active" v-model:checked="activeCampaignsOnly" />
            </div>
          </div>
        </div>
      </div>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="space-y-4 p-4 sm:p-6">
        <div class="grid gap-4 lg:grid-cols-3">
          <div v-for="n in 3" :key="`meta-skeleton-p-${n}`" class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-32" />
            <Skeleton class="h-10 w-full" />
          </div>
        </div>
        <Skeleton class="h-[220px] w-full rounded-lg" />
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
                :value="metricValue(item.key)"
                :format="item.format"
                :delta="trendHalf(valuesFromSeries(item.key))"
                :invert-delta="invertKey(item.key)"
                delta-suffix="tendência"
                :sparkline="valuesFromSeries(item.key)"
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
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {{ block.title || 'Detalhamento' }}
            </p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ReportKpiCard
                v-for="item in metricDefsForBlock(block)"
                :key="item.key"
                :label="item.label"
                :value="metricValue(item.key)"
                :format="item.format"
                :delta="trendHalf(valuesFromSeries(item.key))"
                :invert-delta="invertKey(item.key)"
                delta-suffix="tendência"
                :sparkline="valuesFromSeries(item.key)"
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
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ block.title || 'Investimento vs resultados' }}
              </p>
              <p class="mt-0.5 text-sm text-muted-foreground">
                Evolução diária da conta
              </p>
            </div>
            <ReportTrendChart
              :data="trendData"
              index="date"
              :series="[
                { key: 'investimento', label: 'Investimento (R$)' },
                { key: 'resultados', label: 'Resultados' },
                { key: 'alcance', label: 'Alcance' },
              ]"
              :height="240"
              :y-formatter="(v) => formatReportMetricValue(v, v >= 100 ? 'integer' : 'decimal')"
            />
          </div>

          <div
            v-else-if="block.type === 'campaigns_table' || block.type === 'insights'"
            class="border-b px-4 py-4 sm:px-6"
            :class="blockIndex === visibleBlocks.length - 1 ? 'border-b-0' : ''"
          >
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {{ block.title || (block.type === 'insights' ? 'Insights' : 'Campanhas') }}
            </p>
            <ReportInsightTable
              :columns="campaignColumns"
              :rows="campaignRows as any"
              :max-rows="40"
              empty-text="Sem campanhas neste modelo/período."
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
