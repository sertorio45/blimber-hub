<script setup lang="ts">
import { ADS_LEGACY_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Criativos de Ads',
})

await navigateTo(ADS_LEGACY_REDIRECTS['/ads/creatives'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para criativos…
  </div>
</template>
