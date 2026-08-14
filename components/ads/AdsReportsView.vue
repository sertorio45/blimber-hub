<script setup lang="ts">
/**
 * Paid media reports. Canonical hub: `/marketing/reports/ads`.
 * Editorial campaigns stay in Marketing.
 */
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'
</script>

<template>
  <div class="flex flex-col gap-6">
    <AdsMarketingChrome />
    <MarketingReportsPanel
      title="Relatórios pagos"
      description="Performance de mídia paga e analytics — Meta Ads, Google Ads e Google Analytics."
    />
  </div>
</template>
