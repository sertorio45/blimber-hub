<script setup lang="ts">
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Marketing',
})
</script>

<template>
  <MarketingReportsPanel
    title="Relatórios de Marketing"
    description="Visão executiva de Google Ads, Google Analytics e Meta — KPIs, tendências e detalhamento por canal."
  />
</template>
