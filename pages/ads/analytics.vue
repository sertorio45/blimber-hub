<script setup lang="ts">
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Analytics',
})
</script>

<template>
  <MarketingReportsPanel
    locked-source="google_analytics"
    title="Analytics"
    description="Métricas de comportamento e conversão no Google Analytics."
  />
</template>
