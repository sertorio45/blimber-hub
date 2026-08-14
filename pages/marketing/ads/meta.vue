<script setup lang="ts">
/**
 * Paid Meta Ads board under Marketing. Not editorial (`social_campaigns`).
 */
import AdsMarketingChrome from '@/components/ads/AdsMarketingChrome.vue'
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Meta Ads',
})
</script>

<template>
  <div class="space-y-4">
    <AdsMarketingChrome />
    <MarketingReportsPanel
      locked-source="meta"
      title="Meta Ads"
      description="Campanhas pagas no Meta (Facebook / Instagram) — KPIs, tendências e detalhamento."
    />
  </div>
</template>
