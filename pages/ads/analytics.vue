<script setup lang="ts">
import { ADS_LEGACY_REDIRECTS } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Google Analytics',
})

await navigateTo(ADS_LEGACY_REDIRECTS['/ads/analytics'], { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Analytics…
  </div>
</template>
