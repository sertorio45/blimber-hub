<script setup lang="ts">
/**
 * Marketing → Ads home. Canonical paid overview.
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
