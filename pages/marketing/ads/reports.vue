<script setup lang="ts">
/**
 * Legacy Ads reports URL — canonical hub is `/marketing/reports/ads`.
 */
import { MARKETING_REPORTS_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios de Ads',
})

await navigateTo(MARKETING_REPORTS_REDIRECTS['/marketing/ads/reports'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para relatórios de anúncios…
  </div>
</template>
