<script setup lang="ts">
/**
 * Ads overview — shared by `/ads` and `/marketing/ads` (ETAPA 2).
 *
 * Domain (see `constants/ads-domain.ts`):
 * - Paid: live Meta/Google APIs (+ `marketing_campaigns` / cache)
 * - Editorial: `social_campaigns` → `/marketing/campaigns` (never listed here)
 * - Brand Context peek: `useAdsBrandContext` → Brand Center of active tenant
 */
import AdsBrandContextCard from '@/components/ads/AdsBrandContextCard.vue'
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import GoogleAdsBrandIcon from '@/components/brand/GoogleAdsBrandIcon.vue'
import GoogleAnalyticsBrandIcon from '@/components/brand/GoogleAnalyticsBrandIcon.vue'
import MetaBrandIcon from '@/components/brand/MetaBrandIcon.vue'
import ReportKpiCard from '@/components/marketing/ReportKpiCard.vue'
import { useAdsShellBase } from '~/composables/ads/useAdsShellBase'
import { formatReportMetricValue } from '~/composables/marketing/useMarketingReportMetrics'
import { useWorkspace } from '~/composables/useWorkspace'

const { adsBasePath, isMarketingAdsShell } = useAdsShellBase()
const { tenantId } = useTenant()
const workspace = useWorkspace()
const canReports = computed(() => workspace.can('marketing.social.reports'))

const { data, pending, showSkeleton, refresh } = useMarketingFetch({
  key: () => `ads-home-overview-${tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: any }>('/api/marketing/overview', {
      query: {
        source: 'all',
        meta_template: 'overview',
        google_template: 'overview',
        analytics_template: 'overview',
        tenant_id: tenantId.value || undefined,
        date_preset: 'last_7d',
        meta_active_only: 'true',
        insights_only: 'true',
      },
    })
    return response.data
  },
  default: () => null as any,
  watch: [tenantId],
  enabled: () => Boolean(tenantId.value) && canReports.value,
})

const metaSpend = computed(() => data.value?.meta?.metrics?.spend ?? null)
const googleSpend = computed(() => data.value?.google?.metrics?.cost ?? null)
const analyticsSessions = computed(() => data.value?.analytics?.metrics?.sessions ?? null)
const totalPaidSpend = computed(() => {
  const meta = Number(metaSpend.value || 0)
  const google = Number(googleSpend.value || 0)
  if (!data.value?.meta?.connected && !data.value?.google?.connected)
    return null
  return meta + google
})

const metaCampaignCount = computed(() => (data.value?.meta?.campaigns ?? []).length)
const googleCampaignCount = computed(() => (data.value?.google?.campaigns ?? []).length)

const channels = [
  {
    title: 'Meta Ads',
    description: 'Facebook e Instagram Ads',
    to: '/ads/meta',
    brand: 'meta' as const,
  },
  {
    title: 'Google Ads',
    description: 'Campanhas de busca e display',
    to: '/ads/google',
    brand: 'google_ads' as const,
  },
  {
    title: 'Analytics',
    description: 'Tráfego e conversões',
    to: '/ads/analytics',
    brand: 'analytics' as const,
  },
]
</script>

<template>
  <div class="space-y-8">
    <AdsMarketingChrome />
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Visão Geral
        </h1>
        <p class="mt-1 max-w-2xl text-muted-foreground">
          Mídia paga e analytics do tenant — Meta Ads, Google Ads e Google Analytics.
          Dados reais dos últimos 7 dias (sem métricas fictícias).
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="canReports"
          variant="outline"
          :disabled="pending"
          @click="refresh()"
        >
          <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="pending ? 'animate-spin' : ''" />
          Atualizar
        </Button>
        <Button
          v-if="canReports"
          variant="outline"
          @click="navigateTo(`${adsBasePath}/reports`)"
        >
          <Icon name="lucide:bar-chart-3" class="mr-2 h-4 w-4" />
          Relatórios
        </Button>
      </div>
    </div>

    <MarketingPageSkeleton v-if="canReports && showSkeleton" variant="dashboard" content-only />

    <template v-else-if="canReports">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          label="Investimento pago (7d)"
          :value="totalPaidSpend"
          format="currency"
          :muted="totalPaidSpend == null"
        />
        <ReportKpiCard
          label="Investimento Meta"
          :value="data?.meta?.connected ? metaSpend : null"
          format="currency"
          :muted="!data?.meta?.connected"
        />
        <ReportKpiCard
          label="Investimento Google Ads"
          :value="data?.google?.connected ? googleSpend : null"
          format="currency"
          :muted="!data?.google?.connected"
        />
        <ReportKpiCard
          label="Sessões Analytics"
          :value="data?.analytics?.connected ? analyticsSessions : null"
          format="integer"
          :muted="!data?.analytics?.connected"
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
        <Card
          v-for="channel in channels"
          :key="channel.to"
          class="transition-colors hover:border-foreground/20"
        >
          <CardHeader class="flex flex-row items-start gap-3 space-y-0">
            <div class="h-10 w-10 flex shrink-0 items-center justify-center border rounded-lg bg-muted/40">
              <span v-if="channel.brand === 'meta'" class="text-[#0866FF]">
                <MetaBrandIcon size="md" />
              </span>
              <GoogleAdsBrandIcon v-else-if="channel.brand === 'google_ads'" size="md" />
              <GoogleAnalyticsBrandIcon v-else size="md" />
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <CardTitle class="text-base">
                {{ channel.title }}
              </CardTitle>
              <CardDescription>
                {{ channel.description }}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="channel.brand === 'meta'" class="text-xs text-muted-foreground">
              {{ metaCampaignCount }} campanha(s) ·
              {{ data?.meta?.connected ? 'conectado' : 'não conectado' }}
            </p>
            <p v-else-if="channel.brand === 'google_ads'" class="text-xs text-muted-foreground">
              {{ googleCampaignCount }} campanha(s) ·
              {{ data?.google?.connected ? 'conectado' : data?.google?.needs_account ? 'conta pendente' : 'não conectado' }}
            </p>
            <p v-else class="text-xs text-muted-foreground">
              {{ data?.analytics?.connected ? 'conectado' : data?.analytics?.needs_property ? 'propriedade pendente' : 'não conectado' }}
              <template v-if="data?.analytics?.connected">
                · {{ formatReportMetricValue(analyticsSessions, 'integer') }} sessões
              </template>
            </p>
            <Button variant="outline" class="w-full" @click="navigateTo(channel.to)">
              Abrir
              <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </template>

    <Card v-else class="border-dashed">
      <CardContent class="p-8 text-sm text-muted-foreground">
        Você não tem permissão para ver relatórios de Ads neste workspace.
      </CardContent>
    </Card>

    <AdsBrandContextCard />

    <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">
            Campanhas pagas
          </CardTitle>
          <CardDescription>
            Lista unificada Meta + Google Ads — não é editorial
            (<code class="rounded bg-muted px-1 text-xs">social_campaigns</code>).
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-2">
          <Button variant="outline" class="flex-1" @click="navigateTo(`${adsBasePath}/campaigns`)">
            Ver campanhas
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
          <Button variant="ghost" @click="navigateTo(`${adsBasePath}/creatives`)">
            Criativos
          </Button>
        </CardContent>
      </Card>

      <Card v-if="!isMarketingAdsShell">
        <CardHeader>
          <CardTitle class="text-base">
            Marketing
          </CardTitle>
          <CardDescription>
            Conteúdo orgânico, calendário e aprovações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" class="w-full" @click="navigateTo('/marketing')">
            Abrir Marketing
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">
            Integrações
          </CardTitle>
          <CardDescription>
            Contas de anúncios e analytics (tela oficial).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" class="w-full" @click="navigateTo('/settings/integrations')">
            Contas conectadas
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
