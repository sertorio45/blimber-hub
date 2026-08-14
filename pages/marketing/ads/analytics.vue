<script setup lang="ts">
/**
 * Legacy Ads analytics URL — canonical hub is `/marketing/reports/analytics`.
 */
import { MARKETING_REPORTS_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Analytics',
})

await navigateTo(MARKETING_REPORTS_REDIRECTS['/marketing/ads/analytics'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Analytics…
  </div>
</template>
