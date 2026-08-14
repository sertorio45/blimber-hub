<script setup lang="ts">
/**
 * Ads creatives — same implementation as `/marketing/ads/creatives`.
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
