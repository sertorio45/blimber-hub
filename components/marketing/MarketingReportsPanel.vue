<script setup lang="ts">
/**
 * Paid-media / analytics boards via `/api/marketing/overview`.
 * Do not mix editorial `social_campaigns` here.
 */
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
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'
import { defaultCustomDateRange } from '~/lib/marketing/reports-hub'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  lockedSource?: MarketingReportSource | null
  defaultSource?: MarketingReportSource
  hideHeader?: boolean
  hidePeriod?: boolean
  syncRangeQuery?: boolean
  allowedSources?: MarketingReportSource[] | null
}>(), {
  title: 'Relatórios',
  description: 'Visão executiva de Google Ads, Google Analytics e Meta — KPIs, tendências e detalhamento por canal.',
  lockedSource: null,
  defaultSource: 'meta',
  hideHeader: false,
  hidePeriod: false,
  syncRangeQuery: false,
  allowedSources: null,
})

const { tenantId } = useTenant()
const queryRange = useMarketingReportsRange()

const allowed = computed(() => {
  if (props.lockedSource)
    return [props.lockedSource]
  return props.allowedSources?.length ? props.allowedSources : null
})

function initialSource(): MarketingReportSource {
  const candidate = props.lockedSource || props.defaultSource
  if (allowed.value && !allowed.value.includes(candidate))
    return allowed.value[0]!
  return candidate
}

const source = ref<MarketingReportSource>(initialSource())
const metaTemplate = ref<MetaReportTemplateId>('overview')
const googleTemplate = ref<GoogleAdsReportTemplateId>('overview')
const analyticsTemplate = ref<AnalyticsReportTemplateId>('overview')

const localDatePreset = ref<MarketingDatePreset | string>('last_7d')
const localDateStart = ref('')
const localDateEnd = ref('')
const metaActiveOnly = ref(true)

const datePreset = computed({
  get: (): MarketingDatePreset | string =>
    props.syncRangeQuery ? queryRange.datePreset.value : localDatePreset.value,
  set: (value: MarketingDatePreset | string) => {
    if (props.syncRangeQuery)
      queryRange.datePreset.value = String(value)
    else
      localDatePreset.value = value
  },
})

const dateStart = computed({
  get: () => (props.syncRangeQuery ? queryRange.dateStart.value : localDateStart.value),
  set: (value: string) => {
    if (props.syncRangeQuery)
      queryRange.dateStart.value = value
    else
      localDateStart.value = value
  },
})

const dateEnd = computed({
  get: () => (props.syncRangeQuery ? queryRange.dateEnd.value : localDateEnd.value),
  set: (value: string) => {
    if (props.syncRangeQuery)
      queryRange.dateEnd.value = value
    else
      localDateEnd.value = value
  },
})

watch(
  () => props.lockedSource,
  (value) => {
    if (value)
      source.value = value
  },
)

watch(allowed, (list) => {
  if (list && !list.includes(source.value))
    source.value = list[0]!
}, { immediate: true })

watch(datePreset, (value) => {
  if (props.syncRangeQuery)
    return
  if (value === 'custom' && !localDateStart.value) {
    const range = defaultCustomDateRange()
    localDateEnd.value = range.dateEnd
    localDateStart.value = range.dateStart
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

const showSourceSidebar = computed(() => !props.lockedSource && (allowed.value?.length || 3) > 1)

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
    date_preset: String(datePreset.value),
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

const { data, pending, showSkeleton, refresh, error: loadError } = useMarketingFetch({
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

const loadErrorMessage = computed(() =>
  loadError.value ? toUserFacingReportError(loadError.value) : '',
)

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
    <div
      v-if="!hideHeader"
      class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ title }}
        </h1>
        <p class="text-muted-foreground">
          {{ description }}
        </p>
      </div>
    </div>

    <MarketingPageSkeleton v-if="showSkeleton" variant="reports" content-only />

    <div
      v-else-if="loadErrorMessage"
      class="flex flex-col items-center justify-center gap-4 border border-destructive/30 rounded-xl bg-destructive/5 px-6 py-16 text-center"
    >
      <Icon name="lucide:alert-circle" class="h-10 w-10 text-destructive" />
      <div class="max-w-md space-y-2">
        <p class="text-destructive font-medium">
          Erro ao carregar relatórios
        </p>
        <p class="text-sm text-muted-foreground">
          {{ loadErrorMessage }}
        </p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <Button variant="outline" :disabled="pending" @click="refreshMarketing">
          Tentar novamente
        </Button>
        <Button as-child variant="outline">
          <NuxtLink to="/settings/integrations">
            Ir para Integrações
          </NuxtLink>
        </Button>
      </div>
    </div>

    <div v-else class="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <div
        v-if="showSourceSidebar"
        class="w-full flex flex-col gap-2 md:w-auto"
      >
        <div class="flex gap-1 overflow-x-auto md:hidden">
          <Button
            v-for="item in (allowed || ['meta', 'google_ads', 'google_analytics'])"
            :key="item"
            type="button"
            size="sm"
            class="shrink-0"
            :variant="source === item ? 'default' : 'outline'"
            @click="source = item"
          >
            <template v-if="item === 'meta'">
              Meta
            </template>
            <template v-else-if="item === 'google_ads'">
              Google Ads
            </template>
            <template v-else>
              Analytics
            </template>
          </Button>
        </div>
        <div class="hidden md:block">
          <MarketingReportTemplateSidebar
            v-model="source"
            class="md:sticky md:top-4 md:self-start"
            :sources="allowed"
          />
        </div>
      </div>

      <div class="min-w-0 flex flex-1 flex-col gap-6">
        <div class="flex flex-col gap-4 border rounded-xl bg-card/50 p-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div v-if="!hidePeriod" class="flex flex-wrap items-center gap-2">
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

          <div class="flex flex-wrap items-end gap-3" :class="hidePeriod ? 'ml-auto' : ''">
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
