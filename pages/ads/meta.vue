<script setup lang="ts">
/**
 * Paid Meta Ads board. Not editorial (`social_campaigns` → Marketing).
 */
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Meta Ads',
})
</script>

<template>
  <MarketingReportsPanel
    locked-source="meta"
    title="Meta Ads"
    description="Campanhas pagas no Meta (Facebook / Instagram) — KPIs, tendências e detalhamento."
  />
</template>
