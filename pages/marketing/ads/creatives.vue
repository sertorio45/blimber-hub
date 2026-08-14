<script setup lang="ts">
/**
 * Marketing → Ads criativos.
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
