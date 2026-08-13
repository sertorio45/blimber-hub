<script setup lang="ts">
import MarketingOrganicReportsPanel from '@/components/marketing/MarketingOrganicReportsPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Marketing',
})
</script>

<template>
  <MarketingOrganicReportsPanel
    title="Relatórios de Marketing"
    description="Métricas orgânicas das redes conectadas — Facebook Page e Instagram Business."
  />
</template>
