<script setup lang="ts">
/**
 * Ads creatives — architecture placeholder (ETAPA 7).
 * Shared by `/ads/creatives` and `/marketing/ads/creatives`.
 *
 * Documents the future Blimber AI inputs without generating copy/images.
 * Domain: paid campaigns only — never `social_campaigns` (editorial Marketing).
 */
import AdsBrandContextCard from '@/components/ads/AdsBrandContextCard.vue'
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import { useAdsShellBase } from '~/composables/ads/useAdsShellBase'
import {
  ADS_PAID_CAMPAIGN_SOURCE,
  MARKETING_EDITORIAL_CAMPAIGN_TABLE,
} from '~/constants/ads-domain'
import {
  ADS_BRAND_CENTER_PATH,
  ADS_CREATIVE_PIPELINE_FACTORS,
} from '~/utils/ads-brand'

const { adsBasePath } = useAdsShellBase()
const { currentTenant, tenantId } = useTenant()
const clientName = computed(() => currentTenant.value?.name?.trim() || null)
</script>

<template>
  <div class="space-y-8">
    <AdsMarketingChrome />
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            Em preparação
          </Badge>
          <Badge variant="outline">
            Arquitetura
          </Badge>
        </div>
        <h1 class="text-2xl font-bold tracking-tight">
          Criativos
        </h1>
        <p class="mt-1 max-w-2xl text-muted-foreground">
          Pipeline futuro da Blimber AI para anúncios pagos.
          Nesta etapa apenas a interface e o contrato de dados — sem gerar imagens ou textos.
        </p>
      </div>
      <Button
        variant="outline"
        @click="navigateTo(ADS_BRAND_CENTER_PATH)"
      >
        <Icon name="lucide:palette" class="mr-2 h-4 w-4" />
        Brand Center
      </Button>
    </div>

    <Card class="border-dashed bg-muted/20">
      <CardHeader>
        <CardTitle class="text-base">
          O que a IA vai usar
        </CardTitle>
        <CardDescription>
          Fluxo previsto:
          campanha paga + produto + marca + objetivo → Blimber AI → copy / imagem / variações.
          <template v-if="clientName">
            Contexto atual: <span class="text-foreground font-medium">{{ clientName }}</span>.
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="factor in ADS_CREATIVE_PIPELINE_FACTORS"
            :key="factor.id"
            class="border rounded-lg bg-background p-4"
          >
            <p class="text-sm font-medium">
              {{ factor.label }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ factor.description }}
            </p>
          </li>
        </ul>
        <p class="mt-4 text-xs text-muted-foreground">
          Fonte de campanhas: <code class="rounded bg-muted px-1">{{ ADS_PAID_CAMPAIGN_SOURCE }}</code>
          · Editorial Marketing (<code class="rounded bg-muted px-1">{{ MARKETING_EDITORIAL_CAMPAIGN_TABLE }}</code>)
          não entra neste fluxo.
        </p>
      </CardContent>
    </Card>

    <div class="grid gap-4 lg:grid-cols-2">
      <AdsBrandContextCard />

      <Card>
        <CardHeader>
          <CardTitle class="text-base">
            Geração (ainda não disponível)
          </CardTitle>
          <CardDescription>
            Copy e imagens com Blimber AI ficam para uma etapa futura.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-sm text-muted-foreground">
            Quando existir, a geração consumirá o Brand Context do tenant ativo
            (agência → cliente via workspace), nunca de outro cliente.
            Nesta página não há ação de gerar.
          </p>
          <p
            v-if="!tenantId"
            class="text-xs text-muted-foreground"
          >
            Selecione um cliente no workspace para amarrar o contexto da marca.
          </p>
          <Button
            variant="outline"
            class="w-full"
            @click="navigateTo(`${adsBasePath}/campaigns`)"
          >
            Ver campanhas pagas
            <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
