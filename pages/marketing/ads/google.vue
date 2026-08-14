<script setup lang="ts">
/**
 * Paid Google Ads board under Marketing. Not editorial (`social_campaigns`).
 */
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Ads',
})
</script>

<template>
  <MarketingReportsPanel
    locked-source="google_ads"
    title="Google Ads"
    description="Campanhas pagas no Google Ads — KPIs, tendências e detalhamento."
  />
</template>
