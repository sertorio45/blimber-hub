<script setup lang="ts">
/**
 * Paid Google Ads board under Marketing. Not editorial (`social_campaigns`).
 */
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Ads',
})
</script>

<template>
  <div class="space-y-4">
    <AdsMarketingChrome />
    <MarketingReportsPanel
      locked-source="google_ads"
      title="Google Ads"
      description="Campanhas pagas no Google Ads — KPIs, tendências e detalhamento."
    />
  </div>
</template>
