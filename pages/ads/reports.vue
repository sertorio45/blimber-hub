<script setup lang="ts">
import { ADS_LEGACY_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Ads',
})

await navigateTo(ADS_LEGACY_REDIRECTS['/ads/reports'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para relatórios pagos…
  </div>
</template>
