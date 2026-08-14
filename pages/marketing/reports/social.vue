<script setup lang="ts">
import MarketingOrganicReportsPanel from '@/components/marketing/MarketingOrganicReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios · Redes sociais',
})
</script>

<template>
  <MarketingOrganicReportsPanel
    hide-header
    hide-period
    sync-range-query
    title="Redes sociais"
    description="Métricas orgânicas das redes conectadas — Facebook Page e Instagram Business."
  />
</template>
