<script setup lang="ts">
import type { ReportMetricFormat } from '~/types/marketing-reports'
import MiniSparkline from '@/components/marketing/MiniSparkline.vue'
import ReportDeltaBadge from '@/components/marketing/ReportDeltaBadge.vue'
import {
  formatDurationSeconds,
  formatReportMetricValue,
} from '~/composables/marketing/useMarketingReportMetrics'

const props = withDefaults(
  defineProps<{
    label: string
    value: number | null | undefined
    format?: ReportMetricFormat | 'duration'
    delta?: number | null
    invertDelta?: boolean
    deltaSuffix?: string
    sparkline?: number[]
    muted?: boolean
    size?: 'primary' | 'detail'
  }>(),
  {
    format: 'integer',
    invertDelta: false,
    muted: false,
    size: 'primary',
  },
)

const display = computed(() => {
  if (props.format === 'duration')
    return formatDurationSeconds(props.value)
  return formatReportMetricValue(props.value, props.format)
})
</script>

<template>
  <div
    class="flex flex-col justify-between gap-2 rounded-lg border bg-card"
    :class="size === 'primary' ? 'gap-3 p-4' : 'min-h-[100px] p-3'"
  >
    <div>
      <p class="text-xs font-medium text-muted-foreground">
        {{ label }}
      </p>
      <p
        class="mt-1 font-semibold tabular-nums"
        :class="size === 'primary' ? 'text-2xl' : 'text-lg'"
      >
        {{ display }}
      </p>
      <ReportDeltaBadge
        v-if="delta != null"
        class="mt-1"
        :value="delta"
        :invert="invertDelta"
        :compact="size === 'detail'"
        :suffix="deltaSuffix"
      />
    </div>
    <MiniSparkline
      v-if="sparkline?.length"
      :tone="muted ? 'muted' : 'primary'"
      :values="sparkline"
    />
  </div>
</template>
