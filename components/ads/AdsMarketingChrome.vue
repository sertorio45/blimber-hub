<script setup lang="ts">
/**
 * Marketing-only chrome for Ads views (ETAPA 3). Hidden on the sibling Ads product.
 */
import { useAdsShellBase } from '~/composables/ads/useAdsShellBase'

const { isMarketingAdsShell, marketingAdsTrail, tenantLabel } = useAdsShellBase()
</script>

<template>
  <div
    v-if="isMarketingAdsShell && marketingAdsTrail.length"
    class="space-y-1"
  >
    <BaseBreadcrumbCustom :links="marketingAdsTrail" />
    <p class="text-xs text-muted-foreground">
      <template v-if="tenantLabel">
        Cliente ativo: {{ tenantLabel }}
      </template>
      <template v-else>
        Selecione um cliente no workspace para carregar marca e mídia paga.
      </template>
    </p>
  </div>
</template>
