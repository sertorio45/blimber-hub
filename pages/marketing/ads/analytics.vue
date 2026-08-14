<script setup lang="ts">
/**
 * Analytics board under Marketing Ads (paid / performance), not editorial.
 */
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Analytics',
})
</script>

<template>
  <div class="space-y-4">
    <AdsMarketingChrome />
    <MarketingReportsPanel
      locked-source="google_analytics"
      title="Analytics"
      description="Métricas de comportamento e conversão no Google Analytics."
    />
  </div>
</template>
