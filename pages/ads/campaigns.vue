<script setup lang="ts">
import { ADS_LEGACY_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Campanhas de Ads',
})

await navigateTo(ADS_LEGACY_REDIRECTS['/ads/campaigns'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para campanhas pagas…
  </div>
</template>
