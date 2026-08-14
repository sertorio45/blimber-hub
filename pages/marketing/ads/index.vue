<script setup lang="ts">
/**
 * Marketing → Ads home (ETAPA 2). Same view as `/ads`.
 */
import AdsOverviewView from '@/components/ads/AdsOverviewView.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Marketing · Ads',
})
</script>

<template>
  <AdsOverviewView />
</template>
