<script setup lang="ts">
/**
 * Paid reports for Ads product — same implementation as `/marketing/ads/reports`.
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
