<script setup lang="ts">
import type { Lead } from '~/types/crm'

const props = defineProps<{
  lead: Lead
}>()

const hasCtwa = computed(() => Boolean(props.lead.meta_ctwa_clid || props.lead.attribution_method === 'ctwa_clid'))

const clickDate = computed(() => {
  const raw = props.lead.attribution_date
  if (!raw)
    return null
  try {
    return new Date(raw).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  catch {
    return raw
  }
})

const adLabel = computed(() =>
  props.lead.meta_ad_name || props.lead.meta_ad_id || props.lead.meta_source_id || null,
)
</script>

<template>
  <div
    v-if="hasCtwa"
    class="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 space-y-1.5"
  >
    <div class="flex items-center gap-2">
      <Icon name="lucide:megaphone" class="h-3.5 w-3.5 text-muted-foreground" />
      <p class="text-xs font-medium text-muted-foreground">
        Anúncio WhatsApp
      </p>
    </div>
    <dl class="grid gap-1 text-sm">
      <div v-if="lead.meta_campaign_name || lead.meta_campaign_id" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">
          Campanha
        </dt>
        <dd class="text-right font-medium">
          {{ lead.meta_campaign_name || lead.meta_campaign_id }}
        </dd>
      </div>
      <div v-if="lead.meta_adset_name || lead.meta_adset_id" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">
          Conjunto
        </dt>
        <dd class="text-right font-medium">
          {{ lead.meta_adset_name || lead.meta_adset_id }}
        </dd>
      </div>
      <div v-if="adLabel" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">
          Anúncio
        </dt>
        <dd class="text-right font-medium">
          {{ adLabel }}
        </dd>
      </div>
      <div v-if="clickDate" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">
          Clique
        </dt>
        <dd class="font-medium">
          {{ clickDate }}
        </dd>
      </div>
    </dl>
  </div>
</template>
