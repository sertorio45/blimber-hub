<script setup lang="ts">
/**
 * Paid campaign list for Ads product — same implementation as `/marketing/ads/campaigns`.
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
