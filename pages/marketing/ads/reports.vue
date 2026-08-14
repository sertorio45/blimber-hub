<script setup lang="ts">
/**
 * Marketing → Ads relatórios pagos (ETAPA 2). Same view as `/ads/reports`.
 */
import AdsReportsView from '@/components/ads/AdsReportsView.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Ads',
})
</script>

<template>
  <AdsReportsView />
</template>
