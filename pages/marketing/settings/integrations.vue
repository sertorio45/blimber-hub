<script setup lang="ts">
/**
 * Marketing settings alias — unique OAuth UI remains /settings/integrations.
 */
import { SETTINGS_INTEGRATIONS_ROUTE } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Integrações',
})

await navigateTo(SETTINGS_INTEGRATIONS_ROUTE, { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Integrações…
  </div>
</template>
