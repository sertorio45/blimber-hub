<script setup lang="ts">
import MarketingReportsShell from '@/components/marketing/MarketingReportsShell.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios',
})
</script>

<template>
  <MarketingReportsShell />
</template>
