<script setup lang="ts">
/**
 * There was no Ads settings surface. Bookmarks land on the Marketing hub.
 */
import { MARKETING_SETTINGS_ROUTE } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações de Ads',
})

await navigateTo(MARKETING_SETTINGS_ROUTE, { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Configurações de Marketing…
  </div>
</template>
