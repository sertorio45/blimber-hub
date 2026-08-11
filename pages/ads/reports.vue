<script setup lang="ts">
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Ads',
})
</script>

<template>
  <MarketingReportsPanel
    title="Relatórios"
    description="Performance de mídia paga e analytics — Meta Ads, Google Ads e Google Analytics."
  />
</template>
