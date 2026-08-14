<script setup lang="ts">
/**
 * Marketing → Ads campanhas pagas (ETAPA 2). Same view as `/ads/campaigns`.
 */
import AdsCampaignsView from '@/components/ads/AdsCampaignsView.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanhas de Ads',
})
</script>

<template>
  <AdsCampaignsView />
</template>
