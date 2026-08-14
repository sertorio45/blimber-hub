<script setup lang="ts">
import { ADS_LEGACY_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Ads',
})

await navigateTo(ADS_LEGACY_REDIRECTS['/ads/google'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Google Ads…
  </div>
</template>
