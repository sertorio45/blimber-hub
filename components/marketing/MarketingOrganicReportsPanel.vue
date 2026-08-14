<script setup lang="ts">
/**
 * Organic social reports for `/marketing/reports`.
 * Only surfaces platforms registered in `social_accounts`.
 */
import type { MetaOrganicPeriod, OrganicReportPlatform, OrganicReportsPayload } from '~/types/marketing-organic-reports'

import MarketingOrganicReportSidebar from '@/components/marketing/MarketingOrganicReportSidebar.vue'
import MetaOrganicBoard from '@/components/marketing/MetaOrganicBoard.vue'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  defaultOrganicPlatform,
  isOrganicPlatformAvailable,
} from '~/lib/marketing/organic-report-platforms'
import { toUserFacingReportError } from '~/lib/marketing/report-user-error'
import { defaultCustomDateRange } from '~/lib/marketing/reports-hub'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  hideHeader?: boolean
  hidePeriod?: boolean
  syncRangeQuery?: boolean
}>(), {
  title: 'Relatórios de Marketing',
  description: 'Métricas orgânicas das redes conectadas — Facebook Page e Instagram Business.',
  hideHeader: false,
  hidePeriod: false,
  syncRangeQuery: false,
})

const { tenantId } = useTenant()
const queryRange = useMarketingReportsRange()

const platform = ref<OrganicReportPlatform>('facebook')
const localDatePreset = ref<string>('last_7d')
const localDateStart = ref('')
const localDateEnd = ref('')
const metaPeriod = ref<MetaOrganicPeriod>('day')

const datePreset = computed({
  get: () => (props.syncRangeQuery ? queryRange.datePreset.value : localDatePreset.value),
  set: (value: string) => {
    if (props.syncRangeQuery)
      queryRange.datePreset.value = value
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

watch(datePreset, (value) => {
  if (props.syncRangeQuery)
    return
  if (value === 'custom' && !localDateStart.value) {
    const range = defaultCustomDateRange()
    localDateEnd.value = range.dateEnd
    localDateStart.value = range.dateStart
  }
})

const forceRefreshOnce = ref(false)

function reportsQuery() {
  const query: Record<string, string | undefined> = {
    platform: platform.value,
    tenant_id: tenantId.value || undefined,
    date_preset: datePreset.value,
    meta_period: metaPeriod.value,
  }
  if (datePreset.value === 'custom') {
    query.date_start = dateStart.value
    query.date_end = dateEnd.value
  }
  if (forceRefreshOnce.value) {
    query.force_refresh = 'true'
    forceRefreshOnce.value = false
  }
  return query
}

const { data, pending, showSkeleton, refresh, error: loadError } = useMarketingFetch<{ data: OrganicReportsPayload } | OrganicReportsPayload>({
  key: () =>
    `marketing-organic-reports-${tenantId.value}-${platform.value}-${datePreset.value}-${dateStart.value}-${dateEnd.value}-${metaPeriod.value}`,
  handler: async () => {
    const response = await $fetch<{ data: OrganicReportsPayload }>('/api/marketing/social/organic-reports', {
      query: reportsQuery(),
    })
    return response.data
  },
  default: () => null as OrganicReportsPayload | null,
  watch: [tenantId, platform, datePreset, dateStart, dateEnd, metaPeriod],
  enabled: () => Boolean(tenantId.value),
})

const payload = computed(() => data.value)

const connectedPlatforms = computed(() => payload.value?.platforms || [])

watch(connectedPlatforms, (platforms) => {
  if (!platforms.length)
    return
  if (!isOrganicPlatformAvailable(platforms, platform.value))
    platform.value = defaultOrganicPlatform(platforms) || platform.value
}, { immediate: true })

const showSidebar = computed(() => connectedPlatforms.value.length > 1)
const hasAccounts = computed(() => connectedPlatforms.value.length > 0)

const loadErrorMessage = computed(() =>
  loadError.value ? toUserFacingReportError(loadError.value) : '',
)

const activeBlock = computed(() => {
  if (platform.value === 'facebook')
    return payload.value?.facebook
  if (platform.value === 'instagram')
    return payload.value?.instagram
  return null
})

const lastRefreshAt = ref(0)

async function refreshReports() {
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
      <Button variant="outline" :disabled="pending" @click="refreshReports">
        Tentar novamente
      </Button>
    </div>

    <div
      v-else-if="!hasAccounts"
      class="flex flex-col items-center justify-center gap-4 border rounded-xl border-dashed bg-card/40 px-6 py-16 text-center"
    >
      <Icon name="lucide:link-2-off" class="h-10 w-10 text-muted-foreground" />
      <div class="max-w-md space-y-2">
        <p class="font-medium">
          Nenhuma rede social conectada
        </p>
        <p class="text-sm text-muted-foreground">
          Conecte Facebook, Instagram ou LinkedIn para visualizar relatórios orgânicos.
        </p>
      </div>
      <Button as-child>
        <NuxtLink to="/settings/integrations">
          Ir para Integrações
        </NuxtLink>
      </Button>
    </div>

    <div v-else class="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <MarketingOrganicReportSidebar
        v-if="showSidebar"
        v-model="platform"
        :platforms="connectedPlatforms"
        class="md:sticky md:top-4 md:self-start"
      />

      <div class="min-w-0 flex flex-1 flex-col gap-6">
        <div class="flex flex-col gap-4 border rounded-xl bg-card/50 p-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="!hidePeriod">
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
            </template>

            <Label class="whitespace-nowrap text-xs text-muted-foreground" :class="hidePeriod ? '' : 'ml-2'">
              Agregação Meta
            </Label>
            <Select v-model="metaPeriod">
              <SelectTrigger class="w-[140px]">
                <SelectValue placeholder="Agregação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">
                  Diário
                </SelectItem>
                <SelectItem value="week">
                  Semanal
                </SelectItem>
                <SelectItem value="days_28">
                  28 dias
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <Button variant="outline" :disabled="pending" @click="refreshReports">
              <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="pending ? 'animate-spin' : ''" />
              Atualizar
            </Button>
          </div>
        </div>

        <div
          v-if="platform === 'linkedin'"
          class="border rounded-xl bg-card p-8 text-center text-sm text-muted-foreground"
        >
          <p class="text-foreground font-medium">
            {{ payload?.linkedin?.account?.name }}
          </p>
          <p class="mt-2">
            {{ payload?.linkedin?.message || 'Relatórios orgânicos do LinkedIn em breve.' }}
          </p>
        </div>

        <MetaOrganicBoard
          v-else
          :loading="pending && !activeBlock"
          :block="activeBlock"
          :period="payload?.period"
        />
      </div>
    </div>
  </div>
</template>
