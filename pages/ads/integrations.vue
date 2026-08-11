<script setup lang="ts">
/**
 * Thin redirect: OAuth / social provider panel already lives in settings.
 * Avoid duplicating SocialProvidersPanel under Ads.
 */
definePageMeta({
  middleware: ['auth'],
  title: 'Integrações de Ads',
})

await navigateTo('/settings/integrations', { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Integrações…
  </div>
</template>
