<script setup lang="ts">
import type {
  GoogleAdsOverviewBlock,
  GoogleAdsReportTemplateId,
  GoogleAdsSeriesPoint,
} from '~/types/marketing-reports'
import type { MarketingOverviewPeriod } from '~/types/marketing'

import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
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

const campaigns = computed(() => props.google?.campaigns ?? [])

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
  return [v * 0.88, v * 0.94, v * 0.97, v, v * 1.02]
}

function fmt(key: string) {
  const def = template.value.metrics.find(d => d.key === key)
  const format = def?.format || 'integer'
  return formatReportMetricValue(readMetricBag(displayMetrics.value as any, key), format)
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
  }
  return map[channel.toUpperCase()] || channel
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
          </CardDescription>
          <p
            v-if="google && !google.connected"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Integração não conectada ou sem conta de anúncios selecionada. Configure em Integrações.
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
                </div>
              </div>
              <MiniSparkline
                :tone="item.muted ? 'muted' : 'primary'"
                :values="valuesFromSeries(item.key as any)"
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
                :values="valuesFromSeries(item.key as any)"
              />
            </div>
          </div>
        </div>

        <div v-if="campaigns.length" class="px-4 py-4 sm:px-6">
          <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Campanhas
          </p>
          <div class="overflow-x-auto rounded-lg border">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Campanha
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Tipo
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Custo
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Cliques
                  </th>
                  <th class="px-3 py-2 font-medium text-right">
                    Conversões
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in campaignSelectOptions.slice(0, 25)"
                  :key="String(c.id)"
                  class="border-b last:border-0"
                >
                  <td class="px-3 py-2">
                    <button
                      type="button"
                      class="text-left font-medium hover:underline"
                      @click="selectedCampaignId = String(c.id)"
                    >
                      {{ c.name || c.id }}
                    </button>
                    <p v-if="c.status" class="text-xs text-muted-foreground">
                      {{ statusPt(c.status) }}
                    </p>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">
                    {{ channelPt(c.channel) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(c.cost, 'currency') }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(c.clicks, 'integer') }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ formatReportMetricValue(c.conversions, 'decimal') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-else-if="google?.connected"
          class="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6"
        >
          Nenhuma campanha neste modelo/período.
        </div>
      </template>
    </CardContent>
  </Card>
</template>
