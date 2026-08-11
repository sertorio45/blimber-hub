<script setup lang="ts">
/**
 * Legacy bookmark: Brand Center moved to /marketing/brand (ETAPA 4).
 */
definePageMeta({
  middleware: ['auth'],
  title: 'Guia de comunicação',
})

await navigateTo('/marketing/brand', { redirectCode: 301 })
</script>

<template>
  <div class="text-sm text-muted-foreground">
    Redirecionando para Marca…
  </div>
</template>
