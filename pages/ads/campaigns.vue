<script setup lang="ts">
/**
 * Paid campaign list for Ads product.
 *
 * Domain boundary (see `constants/ads-domain.ts`):
 * - Live Meta / Google Ads via `/api/marketing/overview` (+ cache / legacy
 *   `marketing_campaigns`).
 * - Editorial campaigns: `social_campaigns` → `/marketing/campaigns`.
 *   Never mix the two UIs.
 */
import type { ReportTableColumn } from '@/components/marketing/ReportInsightTable.vue'

import ReportInsightTable from '@/components/marketing/ReportInsightTable.vue'
import {
  ADS_PAID_CAMPAIGN_TABLE,
  MARKETING_EDITORIAL_CAMPAIGN_TABLE,
} from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanhas de Ads',
})

const { tenantId } = useTenant()
const platform = ref<'all' | 'meta' | 'google_ads'>('all')

const { data, pending, showSkeleton, refresh } = useMarketingFetch({
  key: () => `ads-campaigns-${tenantId.value}-last_7d`,
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
  enabled: () => Boolean(tenantId.value),
})

const rows = computed<Record<string, unknown>[]>(() => {
  const metaRows = (data.value?.meta?.campaigns ?? []).map((c: any) => ({
    id: `meta-${c.id}`,
    name: c.name || c.id,
    platform: 'Meta Ads',
    status: String(c.status || '—'),
    impressions: Number(c.impressions || 0),
    clicks: Number(c.clicks || 0),
    spend: Number(c.spend || 0),
    ctr: Number(c.ctr || 0),
  }))
  const googleRows = (data.value?.google?.campaigns ?? []).map((c: any) => ({
    id: `google-${c.id}`,
    name: c.name || c.id,
    platform: 'Google Ads',
    status: String(c.status || '—'),
    impressions: Number(c.impressions || 0),
    clicks: Number(c.clicks || 0),
    spend: Number(c.cost || 0),
    ctr: Number(c.ctr || 0),
  }))

  if (platform.value === 'meta')
    return metaRows
  if (platform.value === 'google_ads')
    return googleRows
  return [...metaRows, ...googleRows]
})

const columns: ReportTableColumn[] = [
  { key: 'name', label: 'Campanha', format: 'raw' },
  { key: 'platform', label: 'Plataforma', format: 'raw' },
  { key: 'status', label: 'Status', format: 'raw' },
  { key: 'impressions', label: 'Impressões', align: 'right', format: 'integer' },
  { key: 'clicks', label: 'Cliques', align: 'right', format: 'integer' },
  { key: 'spend', label: 'Investimento', align: 'right', format: 'currency' },
  { key: 'ctr', label: 'CTR', align: 'right', format: 'percent' },
]
</script>

<template>
  <div class="w-full flex flex-col gap-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Campanhas
        </h1>
        <p class="text-muted-foreground">
          Campanhas pagas em Meta Ads e Google Ads (últimos 7 dias).
          Diferente das campanhas editoriais de Marketing.
        </p>
      </div>
      <Button variant="outline" :disabled="pending" @click="refresh()">
        <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="pending ? 'animate-spin' : ''" />
        Atualizar
      </Button>
    </div>

    <p class="text-xs text-muted-foreground">
      Fonte: APIs live + cache. Tabela paid:
      <code class="rounded bg-muted px-1">{{ ADS_PAID_CAMPAIGN_TABLE }}</code>
      · Editorial Marketing:
      <code class="rounded bg-muted px-1">{{ MARKETING_EDITORIAL_CAMPAIGN_TABLE }}</code>
      →
      <NuxtLink to="/marketing/campaigns" class="underline underline-offset-2">
        /marketing/campaigns
      </NuxtLink>
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <Label class="text-xs text-muted-foreground">
        Plataforma
      </Label>
      <Select v-model="platform">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Plataforma" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            Todas
          </SelectItem>
          <SelectItem value="meta">
            Meta Ads
          </SelectItem>
          <SelectItem value="google_ads">
            Google Ads
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <MarketingPageSkeleton v-if="showSkeleton" variant="list" content-only />

    <template v-else>
      <Card v-if="!rows.length" class="border-dashed">
        <CardContent class="flex flex-col items-start gap-3 p-8">
          <p class="text-sm font-medium">
            Nenhuma campanha paga encontrada
          </p>
          <p class="text-sm text-muted-foreground">
            Conecte Meta Ads ou Google Ads e selecione a conta correta nas integrações.
          </p>
          <Button variant="outline" @click="navigateTo('/settings/integrations')">
            Abrir integrações
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <ReportInsightTable
        v-else
        :columns="columns"
        :rows="rows"
        empty-text="Nenhuma campanha neste filtro."
      />
    </template>
  </div>
</template>
