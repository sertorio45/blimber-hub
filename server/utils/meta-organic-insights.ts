import type { ReportMetricDeltas } from '~/types/marketing-reports'
import type {
  MetaOrganicMetrics,
  MetaOrganicPeriod,
  MetaOrganicReportBlock,
  MetaOrganicSeriesPoint,
  OrganicReportDateRange,
} from '~/types/marketing-organic-reports'

import {
  organicMetricApiNames,
  organicMetricFetchGroups,
  organicMetricsForPlatform,
} from '~/constants/marketing-organic-metrics'

interface GraphInsightValue {
  value?: number | Record<string, number>
  end_time?: string
}

interface GraphInsightRow {
  name?: string
  values?: GraphInsightValue[]
  total_value?: { value?: number | Record<string, number> }
}

export interface MetaOrganicFetchContext {
  accessToken: string
  apiVersion: string
  externalAccountId: string
  platform: 'facebook' | 'instagram'
  account: MetaOrganicReportBlock['account']
  period: OrganicReportDateRange
}

export interface ResolvedOrganicDateWindow {
  since: string
  until: string
  metaPeriod: MetaOrganicPeriod
  preset: string
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(base: Date, days: number): Date {
  const copy = new Date(base)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Map UI presets to Graph API since/until (YYYY-MM-DD) + Meta period bucket. */
export function resolveOrganicDateWindow(
  preset: string,
  dateStart: string,
  dateEnd: string,
  metaPeriod: MetaOrganicPeriod = 'day',
): ResolvedOrganicDateWindow {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const iso = /^\d{4}-\d{2}-\d{2}$/

  if (preset === 'custom' && iso.test(dateStart) && iso.test(dateEnd) && dateStart <= dateEnd) {
    return {
      since: dateStart,
      until: dateEnd,
      metaPeriod,
      preset: 'custom',
    }
  }

  // Page/IG Insights: no lifetime window (≈90 days/request). Remap "all" → last_90d.
  const effectivePreset = preset === 'all' ? 'last_90d' : preset

  const normalized = [
    'today',
    'yesterday',
    'last_7d',
    'last_14d',
    'last_30d',
    'last_90d',
  ].includes(effectivePreset)
    ? effectivePreset
    : 'last_7d'

  if (normalized === 'today') {
    const ymd = formatYmd(today)
    return { since: ymd, until: ymd, metaPeriod, preset: normalized }
  }
  if (normalized === 'yesterday') {
    const y = formatYmd(shiftDays(today, -1))
    return { since: y, until: y, metaPeriod, preset: normalized }
  }

  const daysMap: Record<string, number> = {
    last_7d: 6,
    last_14d: 13,
    last_30d: 29,
    last_90d: 89,
  }
  const offset = daysMap[normalized] ?? 6
  return {
    since: formatYmd(shiftDays(today, -offset)),
    until: formatYmd(today),
    metaPeriod,
    preset: normalized,
  }
}

export function previousOrganicWindow(window: ResolvedOrganicDateWindow): ResolvedOrganicDateWindow {
  const sinceDate = new Date(`${window.since}T00:00:00.000Z`)
  const untilDate = new Date(`${window.until}T00:00:00.000Z`)
  const spanDays = Math.round((untilDate.getTime() - sinceDate.getTime()) / 86_400_000) + 1
  const prevUntil = shiftDays(sinceDate, -1)
  const prevSince = shiftDays(prevUntil, -(spanDays - 1))
  return {
    since: formatYmd(prevSince),
    until: formatYmd(prevUntil),
    metaPeriod: window.metaPeriod,
    preset: window.preset,
  }
}

function parseInsightNumericValue(raw: GraphInsightValue['value']): number {
  if (raw == null)
    return 0
  if (typeof raw === 'number')
    return Number.isFinite(raw) ? raw : 0
  if (typeof raw === 'object') {
    const values = Object.values(raw)
    if (!values.length)
      return 0
    return values.reduce((sum, v) => sum + (Number(v) || 0), 0)
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function insightEndDate(endTime?: string): string {
  if (!endTime)
    return ''
  return endTime.slice(0, 10)
}

/** Normalize Graph API `/insights` payload into per-metric daily series. */
export function mapGraphInsightsToSeries(
  rows: GraphInsightRow[] | null | undefined,
  metricKeys: string[],
  anchorDate?: string,
): MetaOrganicSeriesPoint[] {
  const byDate = new Map<string, MetaOrganicSeriesPoint>()

  for (const row of rows || []) {
    const metric = String(row.name || '')
    if (!metricKeys.includes(metric))
      continue

    if (row.total_value != null) {
      const date = anchorDate || ''
      if (!date)
        continue
      const point = byDate.get(date) || { date }
      point[metric] = parseInsightNumericValue(row.total_value.value)
      byDate.set(date, point as MetaOrganicSeriesPoint)
      continue
    }

    for (const bucket of row.values || []) {
      const date = insightEndDate(bucket.end_time)
      if (!date)
        continue
      const point = byDate.get(date) || { date }
      point[metric] = parseInsightNumericValue(bucket.value)
      byDate.set(date, point as MetaOrganicSeriesPoint)
    }
  }

  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

export function aggregateOrganicMetrics(
  series: MetaOrganicSeriesPoint[],
  platform: 'facebook' | 'instagram',
): MetaOrganicMetrics {
  const defs = organicMetricsForPlatform(platform)
  const metrics: MetaOrganicMetrics = {}

  for (const def of defs) {
    const values = series
      .map(row => Number(row[def.key] ?? 0))
      .filter(v => Number.isFinite(v))

    if (!values.length) {
      metrics[def.key] = 0
      continue
    }

    metrics[def.key] = def.snapshot
      ? values[values.length - 1]
      : values.reduce((sum, v) => sum + v, 0)
  }

  return metrics
}

export function computeOrganicMetricDeltas(
  current: MetaOrganicMetrics,
  previous: MetaOrganicMetrics | null | undefined,
  platform: 'facebook' | 'instagram',
): ReportMetricDeltas | null {
  if (!previous)
    return null
  const defs = organicMetricsForPlatform(platform)
  const deltas: ReportMetricDeltas = {}
  for (const def of defs) {
    const cur = Number(current[def.key] ?? 0)
    const prev = Number(previous[def.key] ?? 0)
    if (prev === 0) {
      deltas[def.key] = cur > 0 ? 100 : null
      continue
    }
    deltas[def.key] = ((cur - prev) / prev) * 100
  }
  return deltas
}

async function fetchGraphInsights(
  ctx: MetaOrganicFetchContext,
  window: ResolvedOrganicDateWindow,
): Promise<GraphInsightRow[]> {
  const groups = organicMetricFetchGroups(ctx.platform)
  const rows: GraphInsightRow[] = []

  for (const group of groups) {
    if (!group.metrics.length)
      continue

    const base = `https://graph.facebook.com/${ctx.apiVersion}/${ctx.externalAccountId}/insights`
    const query: Record<string, string> = {
      metric: group.metrics.join(','),
      period: window.metaPeriod,
      since: window.since,
      until: window.until,
      access_token: ctx.accessToken,
    }
    if (group.graphMetricType === 'total_value')
      query.metric_type = 'total_value'

    const res = await $fetch<{ data?: GraphInsightRow[], error?: { message?: string } }>(base, {
      query,
    }).catch((err: any) => {
      const message = err?.data?.error?.message || err?.message || 'Erro ao consultar insights orgânicos da Meta.'
      throw new Error(message)
    })

    if (res?.error?.message)
      throw new Error(res.error.message)

    rows.push(...(res?.data || []))
  }

  return rows
}

/** Resolve a Page access token for the given external page id (multi-page tenants). */
export async function resolveMetaPageAccessToken(params: {
  userAccessToken: string
  storedPageAccessToken: string
  configuredPageId?: string
  externalAccountId: string
  apiVersion: string
}): Promise<string> {
  const {
    userAccessToken,
    storedPageAccessToken,
    configuredPageId,
    externalAccountId,
    apiVersion,
  } = params

  if (
    storedPageAccessToken
    && configuredPageId
    && configuredPageId === externalAccountId
  ) {
    return storedPageAccessToken
  }

  if (userAccessToken) {
    try {
      const res = await $fetch<{ access_token?: string, error?: { message?: string } }>(
        `https://graph.facebook.com/${apiVersion}/${externalAccountId}`,
        { query: { fields: 'access_token', access_token: userAccessToken } },
      )
      if (res?.access_token)
        return res.access_token
    }
    catch {
      // fall through to stored token
    }
  }

  return storedPageAccessToken || userAccessToken
}

export async function fetchMetaOrganicReport(
  ctx: MetaOrganicFetchContext,
): Promise<MetaOrganicReportBlock> {
  const window = resolveOrganicDateWindow(
    ctx.period.preset,
    ctx.period.date_start || '',
    ctx.period.date_end || '',
    ctx.period.meta_period,
  )
  const skipPreviousPeriod = window.preset === 'all'
  const previousWindow = skipPreviousPeriod ? null : previousOrganicWindow(window)
  const metricKeys = organicMetricApiNames(ctx.platform)

  try {
    const [currentRows, previousRows] = await Promise.all([
      fetchGraphInsights(ctx, window),
      previousWindow
        ? fetchGraphInsights(ctx, previousWindow).catch(() => [])
        : Promise.resolve([]),
    ])

    const series = mapGraphInsightsToSeries(currentRows, metricKeys, window.until)
    const metrics = aggregateOrganicMetrics(series, ctx.platform)
    const previousSeries = previousWindow
      ? mapGraphInsightsToSeries(previousRows, metricKeys, previousWindow.until)
      : []
    const previous_metrics = previousSeries.length
      ? aggregateOrganicMetrics(previousSeries, ctx.platform)
      : null

    return {
      platform: ctx.platform,
      account: ctx.account,
      connected: true,
      metrics,
      previous_metrics,
      deltas: computeOrganicMetricDeltas(metrics, previous_metrics, ctx.platform),
      series,
      meta_period: window.metaPeriod,
      error: null,
    }
  }
  catch (err: any) {
    return {
      platform: ctx.platform,
      account: ctx.account,
      connected: true,
      metrics: {},
      previous_metrics: null,
      deltas: null,
      series: [],
      meta_period: window.metaPeriod,
      error: String(err?.message || 'Erro ao carregar insights orgânicos.'),
    }
  }
}

export function parseOrganicReportsQuery(query: Record<string, unknown>): {
  platform: 'facebook' | 'instagram' | 'all'
  period: OrganicReportDateRange
  forceRefresh: boolean
} {
  const platformRaw = String(query.platform || 'all')
  const platform = ['facebook', 'instagram', 'all'].includes(platformRaw)
    ? platformRaw as 'facebook' | 'instagram' | 'all'
    : 'all'

  let preset = String(query.date_preset || 'last_7d')
  const dateStart = String(query.date_start || '').trim()
  const dateEnd = String(query.date_end || '').trim()
  const metaPeriodRaw = String(query.meta_period || 'day')
  const meta_period: MetaOrganicPeriod = ['day', 'week', 'days_28'].includes(metaPeriodRaw)
    ? metaPeriodRaw as MetaOrganicPeriod
    : 'day'

  if (preset === 'custom') {
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(dateStart) || !iso.test(dateEnd) || dateStart > dateEnd)
      preset = 'last_7d'
  }
  else if (![
    'today',
    'yesterday',
    'last_7d',
    'last_14d',
    'last_30d',
    'last_90d',
    'custom',
  ].includes(preset)) {
    // Remap unsupported all-time (and unknown presets) to last_90d for organic.
    preset = preset === 'all' ? 'last_90d' : 'last_7d'
  }

  return {
    platform,
    period: {
      preset,
      date_start: preset === 'custom' ? dateStart : null,
      date_end: preset === 'custom' ? dateEnd : null,
      meta_period,
    },
    forceRefresh: query.force_refresh === 'true',
  }
}
