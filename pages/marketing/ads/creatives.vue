<script setup lang="ts">
/**
 * Marketing → Ads criativos (ETAPA 2). Same view as `/ads/creatives`.
 */
import AdsCreativesView from '@/components/ads/AdsCreativesView.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Criativos de Ads',
})
</script>

<template>
  <AdsCreativesView />
</template>
