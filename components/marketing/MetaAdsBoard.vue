<script setup lang="ts">
import type { MarketingOverviewPeriod, MetaOverviewBlock, MetaSeriesPoint } from '~/types/marketing'
import type { MetaReportTemplateId } from '~/types/marketing-reports'

import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'
import MiniSparkline from '@/components/marketing/MiniSparkline.vue'
import { Switch } from '@/components/ui/switch'
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
  meta?: MetaOverviewBlock | null
  period?: MarketingOverviewPeriod | null
  loading?: boolean
  templateId?: MetaReportTemplateId | string
}>()

const adsActiveOnly = defineModel<boolean>('adsActiveOnly', { default: false })

const selectedCampaignId = ref<string | 'all'>('all')
const activeCampaignsOnly = ref(true)

const template = computed(() =>
  getReportTemplate('meta', props.templateId || 'overview'),
)
const primaryDefs = computed(() => primaryMetricsOf(template.value))
const detailDefs = computed(() => detailMetricsOf(template.value))

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
  return [fallback * 0.88, fallback * 0.94, fallback * 0.97, fallback, fallback * 1.02]
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

function trendVisual(pct: number | null, invert: boolean) {
  if (pct == null || Number.isNaN(pct))
    return { icon: null as string | null, label: '' }
  const effective = invert ? -pct : pct
  const icon = effective >= 0 ? 'lucide:trending-up' : 'lucide:trending-down'
  const label = `${effective >= 0 ? '+' : ''}${effective.toFixed(0)}%`
  return { icon, label }
}

function fmt(key: string) {
  const def = template.value.metrics.find(d => d.key === key)
  let value = readMetricBag(displayMetrics.value as any, key)
  if (key === 'cost_per_result' && (displayMetrics.value.results || 0) <= 0)
    value = null
  if (key === 'roas' && (value == null || value <= 0))
    value = null
  return formatReportMetricValue(value, def?.format || 'integer')
}

function primaryTrend(key: string) {
  const spark = valuesFromSeries(key)
  const invert = key.includes('cost') || key === 'cpc' || key === 'cpm'
  return trendVisual(trendHalf(spark), invert)
}

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
            Os mini gráficos usam dados diários da conta; os números refletem a campanha selecionada.
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
          <div class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-32" />
            <Skeleton class="h-10 w-full" />
          </div>
          <div class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-8 w-28" />
            <Skeleton class="h-10 w-full" />
          </div>
          <div class="space-y-3 rounded-lg border p-4">
            <Skeleton class="h-3 w-28" />
            <Skeleton class="h-8 w-28" />
            <Skeleton class="h-10 w-full" />
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="n in 8" :key="`meta-skeleton-metric-${n}`" class="space-y-2 rounded-lg border p-3">
            <Skeleton class="h-3 w-20" />
            <Skeleton class="h-6 w-24" />
            <Skeleton class="h-8 w-full" />
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
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-xs font-medium text-muted-foreground">
                    {{ item.label }}
                  </p>
                  <p class="mt-1 text-2xl font-semibold tabular-nums">
                    {{ fmt(item.key) }}
                  </p>
                  <div
                    v-if="primaryTrend(item.key).icon"
                    class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Icon :name="primaryTrend(item.key).icon!" class="h-3.5 w-3.5" />
                    {{ primaryTrend(item.key).label }}
                  </div>
                </div>
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
      </template>
    </CardContent>
  </Card>
</template>
