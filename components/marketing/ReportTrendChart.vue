<script setup lang="ts">
import { Area, Axis, CurveType } from '@unovis/ts'
import { VisArea, VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { shortDateLabel } from '~/composables/marketing/useMarketingReportMetrics'

export interface ReportTrendSeries {
  key: string
  label: string
  color?: string
}

const props = withDefaults(
  defineProps<{
    data: Array<Record<string, string | number>>
    /** X-axis field (usually `date`) */
    index?: string
    series: ReportTrendSeries[]
    height?: number
    /** Format Y tick; default compact number */
    yFormatter?: (v: number) => string
  }>(),
  {
    index: 'date',
    height: 220,
  },
)

const uid = useId().replace(/:/g, '')

const palette = [
  'hsl(var(--primary))',
  'hsl(215 65% 45%)',
  'hsl(160 50% 38%)',
  'hsl(25 80% 48%)',
]

const seriesWithColor = computed(() =>
  props.series.map((s, i) => ({
    ...s,
    color: s.color || palette[i % palette.length],
  })),
)

function xAccessor(_d: Record<string, string | number>, i: number) {
  return i
}

function yAccessor(key: string) {
  return (d: Record<string, string | number>) => Number(d[key] || 0)
}

function tickFormat(i: number | Date) {
  const idx = typeof i === 'number' ? i : 0
  const row = props.data[idx]
  if (!row)
    return ''
  const raw = String(row[props.index] || '')
  return shortDateLabel(raw)
}

const formatY = computed(() =>
  props.yFormatter
  || ((v: number) =>
    v >= 1000
      ? v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
      : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })),
)
</script>

<template>
  <div class="w-full">
    <div
      v-if="seriesWithColor.length > 1"
      class="mb-3 flex flex-wrap items-center gap-3"
    >
      <div
        v-for="s in seriesWithColor"
        :key="s.key"
        class="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span
          class="h-2 w-2 rounded-full"
          :style="{ backgroundColor: s.color }"
        />
        {{ s.label }}
      </div>
    </div>

    <div
      v-if="!data.length"
      class="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
      :style="{ height: `${height}px` }"
    >
      Sem série temporal neste período.
    </div>

    <VisXYContainer
      v-else
      :data="data"
      :margin="{ top: 8, bottom: 28, left: 36, right: 8 }"
      :style="{ height: `${height}px` }"
      class="w-full"
    >
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <linearGradient
            v-for="s in seriesWithColor"
            :id="`trend-fill-${uid}-${s.key}`"
            :key="`grad-${s.key}`"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="5%" :stop-color="s.color" stop-opacity="0.18" />
            <stop offset="95%" :stop-color="s.color" stop-opacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <VisArea
        v-for="s in seriesWithColor.slice(0, 1)"
        :key="`area-${s.key}`"
        :x="xAccessor"
        :y="yAccessor(s.key)"
        color="auto"
        :curve-type="CurveType.MonotoneX"
        :attributes="{
          [Area.selectors.area]: {
            fill: `url(#trend-fill-${uid}-${s.key})`,
          },
        }"
      />

      <VisLine
        v-for="s in seriesWithColor"
        :key="`line-${s.key}`"
        :x="xAccessor"
        :y="yAccessor(s.key)"
        :color="s.color"
        :curve-type="CurveType.MonotoneX"
      />

      <VisAxis
        type="x"
        :tick-format="tickFormat"
        :num-ticks="Math.min(6, Math.max(2, data.length))"
        :grid-line="false"
        :tick-line="false"
        :domain-line="false"
      />
      <VisAxis
        type="y"
        :tick-format="(v: number | Date) => formatY(Number(v))"
        :num-ticks="4"
        :tick-line="false"
        :domain-line="false"
        :grid-line="true"
        :attributes="{
          [Axis.selectors.grid]: {
            stroke: 'hsl(var(--border))',
            'stroke-opacity': 0.7,
          },
        }"
      />
    </VisXYContainer>
  </div>
</template>
