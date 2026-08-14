<script setup lang="ts">
import MarketingReportsPanel from '@/components/marketing/MarketingReportsPanel.vue'
import { PAID_ADS_REPORT_SOURCES } from '~/lib/marketing/reports-hub'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios · Anúncios',
})
</script>

<template>
  <MarketingReportsPanel

    sync-range-query hide-header hide-period
    :allowed-sources="[...PAID_ADS_REPORT_SOURCES]"
    default-source="meta"
    title="Anúncios"
    description="Performance de mídia paga — Meta Ads e Google Ads."
  />
</template>
