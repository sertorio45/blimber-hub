<script setup lang="ts">
import {
  formatReportDelta,
  reportDeltaTone,
} from '~/composables/marketing/useMarketingReportMetrics'

const props = withDefaults(
  defineProps<{
    value?: number | null
    /** When true, negative change is good (cost/CPC/bounce). */
    invert?: boolean
    compact?: boolean
    /** Shown after the percentage; empty hides suffix */
    suffix?: string
  }>(),
  {
    invert: false,
    compact: false,
    suffix: 'vs ant.',
  },
)

const tone = computed(() => reportDeltaTone(props.value, props.invert))
const label = computed(() => formatReportDelta(props.value))
</script>

<template>
  <span
    v-if="label"
    class="inline-flex items-center gap-0.5 tabular-nums"
    :class="[
      compact ? 'text-[11px]' : 'text-xs',
      tone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : '',
      tone === 'down' ? 'text-rose-600 dark:text-rose-400' : '',
      tone === 'neutral' ? 'text-muted-foreground' : '',
    ]"
  >
    <Icon
      v-if="tone === 'up'"
      name="lucide:trending-up"
      class="h-3.5 w-3.5"
    />
    <Icon
      v-else-if="tone === 'down'"
      name="lucide:trending-down"
      class="h-3.5 w-3.5"
    />
    <span>{{ label }}</span>
    <span v-if="!compact && suffix" class="font-normal text-muted-foreground">{{ suffix }}</span>
  </span>
</template>
