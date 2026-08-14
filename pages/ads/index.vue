<script setup lang="ts">
/**
 * Ads product home — same implementation as `/marketing/ads` (ETAPA 2).
 */
import AdsOverviewView from '@/components/ads/AdsOverviewView.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Ads',
})
</script>

<template>
  <AdsOverviewView />
</template>
