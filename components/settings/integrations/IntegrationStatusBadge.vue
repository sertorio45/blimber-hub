<script setup lang="ts">
import type { IntegrationConnectionStatus } from '~/composables/marketing/useIntegrationConnectionStatus'
import { cn } from '@/lib/utils'
import { Badge } from '~/components/ui/badge'
import { integrationStatusLabel } from '~/composables/marketing/useIntegrationConnectionStatus'

const props = defineProps<{
  status: IntegrationConnectionStatus
  /** Optional override (e.g. “Pronto para publicar”). */
  label?: string
}>()

const displayLabel = computed(() => props.label || integrationStatusLabel(props.status))

const toneClass = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    case 'needs_setup':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    case 'expired':
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    default:
      return 'border-border bg-muted/50 text-muted-foreground'
  }
})

const dotClass = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'bg-emerald-500'
    case 'needs_setup':
      return 'bg-amber-500'
    case 'expired':
    case 'error':
      return 'bg-destructive'
    default:
      return 'bg-muted-foreground/50'
  }
})
</script>

<template>
  <Badge
    variant="outline"
    :class="cn('gap-1.5 font-medium', toneClass)"
    :aria-label="`Status: ${displayLabel}`"
  >
    <span
      class="h-1.5 w-1.5 shrink-0 rounded-full"
      :class="dotClass"
      aria-hidden="true"
    />
    {{ displayLabel }}
  </Badge>
</template>
