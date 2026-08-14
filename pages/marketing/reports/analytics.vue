<script setup lang="ts">
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios · Google Analytics',
})
</script>

<template>
  <MarketingReportsPanel
    hide-header
    hide-period
    sync-range-query
    locked-source="google_analytics"
    title="Google Analytics"
    description="Métricas de comportamento e conversão no Google Analytics."
  />
</template>
