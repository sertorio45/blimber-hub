<script setup lang="ts">
import type { MarketingReportSource } from '@/components/marketing/MarketingReportTemplateSidebar.vue'
import type {
  AnalyticsReportTemplateId,
  GoogleAdsReportTemplateId,
  MarketingDatePreset,
  MetaReportTemplateId,
} from '~/types/marketing'

import AnalyticsBoard from '@/components/marketing/AnalyticsBoard.vue'
import GoogleAdsBoard from '@/components/marketing/GoogleAdsBoard.vue'
import MarketingReportTemplatePicker from '@/components/marketing/MarketingReportTemplatePicker.vue'
import MarketingReportTemplateSidebar from '@/components/marketing/MarketingReportTemplateSidebar.vue'
import MetaAdsBoard from '@/components/marketing/MetaAdsBoard.vue'
import { DateRangePicker } from '@/components/ui/date-range-picker'

const { tenantId } = useTenant()
const source = ref<MarketingReportSource>('meta')
const metaTemplate = ref<MetaReportTemplateId>('overview')
const googleTemplate = ref<GoogleAdsReportTemplateId>('overview')
const analyticsTemplate = ref<AnalyticsReportTemplateId>('overview')

const datePreset = ref<MarketingDatePreset | string>('last_7d')
const dateStart = ref('')
const dateEnd = ref('')
const metaActiveOnly = ref(true)

watch(datePreset, (value) => {
  if (value === 'custom' && !dateStart.value) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 30)
    dateEnd.value = end.toISOString().slice(0, 10)
    dateStart.value = start.toISOString().slice(0, 10)
  }
})

watch(source, (value) => {
  if (value === 'meta' && !metaTemplate.value)
    metaTemplate.value = 'overview'
  if (value === 'google_ads' && !googleTemplate.value)
    googleTemplate.value = 'overview'
  if (value === 'google_analytics' && !analyticsTemplate.value)
    analyticsTemplate.value = 'overview'
})

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Marketing',
})

const activeTemplateId = computed({
  get: () => {
    if (source.value === 'meta')
      return metaTemplate.value
    if (source.value === 'google_ads')
      return googleTemplate.value
    return analyticsTemplate.value
  },
  set: (id: string) => {
    if (source.value === 'meta')
      metaTemplate.value = id as MetaReportTemplateId
    else if (source.value === 'google_ads')
      googleTemplate.value = id as GoogleAdsReportTemplateId
    else
      analyticsTemplate.value = id as AnalyticsReportTemplateId
  },
})

function overviewQuery() {
  const query: Record<string, string | undefined> = {
    source: source.value,
    google_template: googleTemplate.value,
    meta_template: metaTemplate.value,
    analytics_template: analyticsTemplate.value,
    tenant_id: tenantId.value || undefined,
    date_preset: datePreset.value,
    meta_active_only: metaActiveOnly.value ? 'true' : 'false',
    insights_only: 'true',
  }
  if (datePreset.value === 'custom') {
    query.date_start = dateStart.value
    query.date_end = dateEnd.value
  }
  return query
}

const forceRefreshOnce = ref(false)

const { data, pending, showSkeleton, refresh } = useMarketingFetch({
  key: () =>
    `marketing-reports-${tenantId.value}-${source.value}-${metaTemplate.value}-${googleTemplate.value}-${analyticsTemplate.value}-${datePreset.value}-${dateStart.value}-${dateEnd.value}-${metaActiveOnly.value}`,
  handler: async () => {
    const query = overviewQuery()
    if (forceRefreshOnce.value) {
      query.force_refresh = 'true'
      forceRefreshOnce.value = false
    }
    const response = await $fetch<{ data: any }>('/api/marketing/overview', { query })
    return response.data
  },
  default: () => null as any,
  watch: [
    tenantId,
    source,
    metaTemplate,
    googleTemplate,
    analyticsTemplate,
    datePreset,
    dateStart,
    dateEnd,
    metaActiveOnly,
  ],
  enabled: () => Boolean(tenantId.value),
})

const showGoogleAdsBlock = computed(() => source.value === 'google_ads')
const showAnalyticsBlock = computed(() => source.value === 'google_analytics')
const showMetaBlock = computed(() => source.value === 'meta')

const lastRefreshAt = ref(0)

async function refreshMarketing() {
  const now = Date.now()
  if (now - lastRefreshAt.value < 1200)
    return
  lastRefreshAt.value = now
  forceRefreshOnce.value = true
  await refresh()
}
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Relatórios de Marketing
        </h1>
        <p class="text-muted-foreground">
          Visão executiva de Google Ads, Google Analytics e Meta — KPIs, tendências e detalhamento por canal.
        </p>
      </div>
    </div>

    <MarketingPageSkeleton v-if="showSkeleton" variant="reports" content-only />

    <div v-else class="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <MarketingReportTemplateSidebar
        v-model="source"
        class="md:sticky md:top-4 md:self-start"
      />

      <div class="min-w-0 flex flex-1 flex-col gap-6">
        <div class="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <Label class="whitespace-nowrap text-xs text-muted-foreground">
              Período
            </Label>
            <Select v-model="datePreset">
              <SelectTrigger class="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">
                  Hoje
                </SelectItem>
                <SelectItem value="yesterday">
                  Ontem
                </SelectItem>
                <SelectItem value="last_7d">
                  Últimos 7 dias
                </SelectItem>
                <SelectItem value="last_14d">
                  Últimos 14 dias
                </SelectItem>
                <SelectItem value="last_30d">
                  Últimos 30 dias
                </SelectItem>
                <SelectItem value="last_90d">
                  Últimos 90 dias
                </SelectItem>
                <SelectItem value="custom">
                  Período personalizado
                </SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              v-if="datePreset === 'custom'"
              v-model:start="dateStart"
              v-model:end="dateEnd"
              class="shrink-0"
            />
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <MarketingReportTemplatePicker
              v-model="activeTemplateId"
              :platform="source"
            />

            <Button variant="outline" :disabled="pending" @click="refreshMarketing">
              <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="pending ? 'animate-spin' : ''" />
              Atualizar
            </Button>
          </div>
        </div>

        <GoogleAdsBoard
          v-if="showGoogleAdsBlock"
          :loading="pending && !data?.google"
          :google="data?.google"
          :period="data?.period"
          :template-id="googleTemplate"
        />

        <AnalyticsBoard
          v-if="showAnalyticsBlock"
          :loading="pending && !data?.analytics"
          :analytics="data?.analytics"
          :period="data?.period"
          :template-id="analyticsTemplate"
        />

        <MetaAdsBoard
          v-if="showMetaBlock"
          v-model:ads-active-only="metaActiveOnly"
          :loading="pending && !data?.meta"
          :meta="data?.meta"
          :period="data?.period"
          :template-id="metaTemplate"
        />
      </div>
    </div>
  </div>
</template>
