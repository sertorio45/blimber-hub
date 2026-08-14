<script setup lang="ts">
import MarketingOrganicReportsPanel from '@/components/marketing/MarketingOrganicReportsPanel.vue'
import { useWorkspace } from '~/composables/useWorkspace'

definePageMeta({
  middleware: ['auth'],
  title: 'Relatórios orgânicos',
})

const workspace = useWorkspace()
const canPaidReports = computed(() => workspace.can('marketing.social.reports'))
</script>

<template>
  <div class="flex flex-col gap-6">
    <div
      v-if="canPaidReports"
      class="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-start gap-3">
        <Icon name="lucide:circle-dollar-sign" class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p class="font-medium">
            Relatórios de campanhas pagas
          </p>
          <p class="text-sm text-muted-foreground">
            Meta Ads, Google Ads e Google Analytics ficam em Marketing → Ads → Relatórios.
          </p>
        </div>
      </div>
      <Button as-child variant="outline" class="shrink-0">
        <NuxtLink to="/marketing/ads/reports">
          Ver relatórios de Ads
          <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
        </NuxtLink>
      </Button>
    </div>

    <MarketingOrganicReportsPanel
      title="Relatórios orgânicos"
      description="Métricas orgânicas das redes conectadas — Facebook Page e Instagram Business."
    />
  </div>
</template>
