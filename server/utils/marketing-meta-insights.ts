import {
  fuzzyGroupsForMetaTemplate,
  resultActionPriorityForMetaTemplate,
} from '~/server/utils/marketing-reports'
import type { MetaReportTemplateId } from '~/types/marketing-reports'
import { metaAdsAllTimeSince } from '~/lib/marketing/reports-hub'

/** Hub reports use Brazil civil dates so Graph `time_range` matches Ads Manager. */
export const MARKETING_INSIGHTS_TIMEZONE = 'America/Sao_Paulo'

/** Unique / grouped types that must not replace additive daily `lead` when both exist. */
const NON_ADDITIVE_LEAD_TYPES = new Set([
  'onsite_conversion.lead_grouped',
  'lead_grouped',
])

const ENGAGEMENT_ACTION_TYPES = new Set([
  'link_click',
  'click',
  'post_engagement',
  'page_engagement',
  'video_view',
  'landing_page_view',
])

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

const LAST_N_INCLUSIVE_OFFSET: Record<string, number> = {
  last_7d: 6,
  last_14d: 13,
  last_30d: 29,
  last_90d: 89,
}

export interface MetaInsightsDateWindow {
  preset: string
  since: string
  until: string
}

export interface MetaAccountMetrics {
  impressions: number
  clicks: number
  spend: number
  reach: number
  ctr: number
  cpc: number
  cpm: number
  results: number
  roas: number | null
  cost_per_result: number
}

export interface MetaDailyInsightPoint extends MetaAccountMetrics {
  date: string
}

export function ymdInTimeZone(
  date: Date,
  timeZone: string = MARKETING_INSIGHTS_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Shift a YYYY-MM-DD civil date without UTC-midnight timezone drift. */
export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days))
  return utc.toISOString().slice(0, 10)
}

/** Civil-month shift in UTC (used for Meta Insights 37-month maximum). */
export function addCalendarMonths(ymd: string, months: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year, (month || 1) - 1 + months, day || 1))
  return utc.toISOString().slice(0, 10)
}

/**
 * Earliest `since` allowed by Meta Ads Insights (error 3018 / date_preset=maximum).
 * @deprecated Prefer `metaAdsAllTimeSince` from reports-hub — kept for local tests/helpers.
 */
export function metaInsightsMaximumSince(
  todayYmd: string,
  maxMonths: number = 37,
): string {
  return metaAdsAllTimeSince(todayYmd, maxMonths)
}

/**
 * Inclusive civil window in America/Sao_Paulo.
 * `last_7d` = today + previous 6 days (7 days including today).
 * Graph `date_preset=last_7d` excludes today — do not use it for Hub reports.
 */
export function resolveMetaInsightsWindow(
  datePreset: string,
  dateStart = '',
  dateEnd = '',
  now: Date = new Date(),
  timeZone: string = MARKETING_INSIGHTS_TIMEZONE,
): MetaInsightsDateWindow {
  const today = ymdInTimeZone(now, timeZone)
  const start = String(dateStart || '').trim()
  const end = String(dateEnd || '').trim()

  if (datePreset === 'custom' && ISO_YMD.test(start) && ISO_YMD.test(end) && start <= end) {
    return { preset: 'custom', since: start, until: end }
  }

  if (datePreset === 'today')
    return { preset: 'today', since: today, until: today }

  if (datePreset === 'yesterday') {
    const y = addCalendarDays(today, -1)
    return { preset: 'yesterday', since: y, until: y }
  }

  if (datePreset === 'all') {
    return {
      preset: 'all',
      since: metaAdsAllTimeSince(today),
      until: today,
    }
  }

  const offset = LAST_N_INCLUSIVE_OFFSET[datePreset]
  if (offset != null) {
    return {
      preset: datePreset,
      since: addCalendarDays(today, -offset),
      until: today,
    }
  }

  return { preset: 'today', since: today, until: today }
}

/** Always send Graph `time_range` so presets include today in the ad-account calendar. */
export function buildMetaInsightsDateQuery(window: MetaInsightsDateWindow): Record<string, string> {
  return {
    time_range: JSON.stringify({ since: window.since, until: window.until }),
  }
}

export function collectActionTotals(actions: unknown[] | undefined): Map<string, number> {
  const totals = new Map<string, number>()
  if (!Array.isArray(actions))
    return totals
  for (const row of actions) {
    const a = row as { action_type?: unknown, value?: unknown }
    const type = String(a?.action_type || '').toLowerCase()
    const val = Number(a?.value || 0)
    if (!type || !val)
      continue
    totals.set(type, (totals.get(type) || 0) + val)
  }
  return totals
}

export function mergeActionTotals(target: Map<string, number>, source: Map<string, number>) {
  for (const [key, value] of source)
    target.set(key, (target.get(key) || 0) + value)
}

function preferAdditiveLeadTotals(totals: Map<string, number>): Map<string, number> {
  const hasAdditiveLead = ['lead', 'onsite_conversion.lead', 'offsite_conversion.fb_pixel_lead']
    .some(type => (totals.get(type) || 0) > 0)
  if (!hasAdditiveLead)
    return totals
  const next = new Map(totals)
  for (const type of NON_ADDITIVE_LEAD_TYPES)
    next.delete(type)
  return next
}

function pickFromTotals(totals: Map<string, number>, templateId: MetaReportTemplateId): string | null {
  const filtered = preferAdditiveLeadTotals(totals)
  if (!filtered.size)
    return null

  const priority = resultActionPriorityForMetaTemplate(templateId)
  for (const key of priority) {
    if ((filtered.get(key) || 0) > 0)
      return key
  }

  const fuzzyGroups = fuzzyGroupsForMetaTemplate(templateId)
  for (const group of fuzzyGroups) {
    let best: { type: string, value: number } | null = null
    for (const [type, value] of filtered) {
      if (type.includes(group) && value > 0 && (!best || value > best.value))
        best = { type, value }
    }
    if (best)
      return best.type
  }

  if (templateId === 'overview') {
    const fallbackPriority = resultActionPriorityForMetaTemplate('overview')
    for (const key of fallbackPriority) {
      if ((filtered.get(key) || 0) > 0)
        return key
    }
  }

  return null
}

export function pickPrimaryResultActionType(
  actions: unknown[] | undefined,
  templateId: MetaReportTemplateId = 'overview',
): string | null {
  return pickFromTotals(collectActionTotals(actions), templateId)
}

export function pickPrimaryResultActionTypeFromRows(
  rows: Array<{ actions?: unknown[] } | null | undefined>,
  templateId: MetaReportTemplateId = 'overview',
): string | null {
  const totals = new Map<string, number>()
  for (const row of rows)
    mergeActionTotals(totals, collectActionTotals(row?.actions))
  return pickFromTotals(totals, templateId)
}

function matchForcedActionValue(totals: Map<string, number>, selected: string): number {
  const exact = totals.get(selected) || 0
  if (exact > 0)
    return exact

  const strip = (value: string) => value
    .replace(/^onsite_conversion\./, '')
    .replace(/^offsite_conversion\./, '')
    .replace(/^fb_pixel_/, '')

  const selectedCore = strip(selected)
  if (NON_ADDITIVE_LEAD_TYPES.has(selected) || NON_ADDITIVE_LEAD_TYPES.has(selectedCore)) {
    return 0
  }

  for (const [type, value] of totals) {
    if (value <= 0)
      continue
    if (NON_ADDITIVE_LEAD_TYPES.has(type) || NON_ADDITIVE_LEAD_TYPES.has(strip(type)))
      continue
    if (strip(type) === selectedCore)
      return value
  }

  return 0
}

/**
 * Count one action type. With `forcedActionType`, never fall back to a different conversion
 * (daily series and the period KPI must use the same metric).
 */
export function parseMetaActionsResults(
  actions: unknown[] | undefined,
  forcedActionType?: string | null,
): number {
  const totals = collectActionTotals(actions)
  if (!totals.size)
    return 0

  const selected = forcedActionType ? forcedActionType.toLowerCase() : pickPrimaryResultActionType(actions)
  if (selected)
    return matchForcedActionValue(totals, selected)

  let best = 0
  for (const [type, value] of totals) {
    if (ENGAGEMENT_ACTION_TYPES.has(type))
      continue
    if (value > best)
      best = value
  }
  return best
}

export function parseCostPerActionType(
  costPerActionType: unknown[] | undefined,
  forcedActionType?: string | null,
): number | null {
  if (!Array.isArray(costPerActionType))
    return null
  const map = new Map<string, number>()
  for (const row of costPerActionType) {
    const item = row as { action_type?: unknown, value?: unknown }
    const type = String(item?.action_type || '').toLowerCase()
    const val = Number(item?.value || 0)
    if (!type || !val)
      continue
    map.set(type, (map.get(type) || 0) + val)
  }
  if (!map.size)
    return null

  const selected = forcedActionType ? forcedActionType.toLowerCase() : ''
  if (selected) {
    const matched = matchForcedActionValue(map, selected)
    return matched > 0 ? matched : null
  }

  const priority = resultActionPriorityForMetaTemplate('overview')
  for (const key of priority) {
    if ((map.get(key) || 0) > 0)
      return map.get(key) || null
  }

  for (const group of ['messaging', 'whatsapp', 'lead', 'purchase']) {
    for (const [type, value] of map) {
      if (type.includes(group) && value > 0)
        return value
    }
  }
  return null
}

export function parsePurchaseRoas(roas: unknown): number | null {
  if (roas == null)
    return null
  if (typeof roas === 'number' && !Number.isNaN(roas))
    return roas
  const arr = Array.isArray(roas) ? roas : []
  for (const row of arr) {
    const item = row as { value?: unknown }
    const v = Number(item?.value ?? row)
    if (v > 0)
      return v
  }
  return null
}

function derivedRates(impressions: number, clicks: number, spend: number) {
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  }
}

export function mapCampaignInsightRow(item: Record<string, unknown>, forcedActionType?: string | null) {
  const impressions = Number(item.impressions || 0)
  const clicks = Number(item.clicks || 0)
  const spend = Number(item.spend || 0)
  const reach = Number(item.reach || 0)
  const rates = derivedRates(impressions, clicks, spend)
  const results = parseMetaActionsResults(item.actions as unknown[] | undefined, forcedActionType)
  const roas = parsePurchaseRoas(item.purchase_roas)
  const costPerResult
    = parseCostPerActionType(item.cost_per_action_type as unknown[] | undefined, forcedActionType)
      || (results > 0 ? spend / results : 0)

  return {
    id: item.campaign_id,
    name: item.campaign_name,
    impressions,
    clicks,
    spend,
    reach,
    ctr: Number(item.ctr ?? rates.ctr),
    cpc: Number(item.cpc || 0) || rates.cpc,
    cpm: Number(item.cpm || 0) || rates.cpm,
    results,
    roas,
    cost_per_result: costPerResult,
  }
}

export function mapDailyInsightRow(item: Record<string, unknown>, forcedActionType?: string | null): MetaDailyInsightPoint {
  const impressions = Number(item.impressions || 0)
  const clicks = Number(item.clicks || 0)
  const spend = Number(item.spend || 0)
  const reach = Number(item.reach || 0)
  const rates = derivedRates(impressions, clicks, spend)
  const results = parseMetaActionsResults(item.actions as unknown[] | undefined, forcedActionType)
  const roas = parsePurchaseRoas(item.purchase_roas)
  const costPerResult
    = parseCostPerActionType(item.cost_per_action_type as unknown[] | undefined, forcedActionType)
      || (results > 0 ? spend / results : 0)
  return {
    date: String(item.date_start || item.date_stop || ''),
    impressions,
    clicks,
    spend,
    reach,
    ctr: Number(item.ctr ?? rates.ctr),
    cpc: Number(item.cpc || 0) || rates.cpc,
    cpm: Number(item.cpm || 0) || rates.cpm,
    results,
    cost_per_result: costPerResult,
    roas,
  }
}

export function emptyMetaMetrics(): MetaAccountMetrics {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    reach: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    results: 0,
    roas: null,
    cost_per_result: 0,
  }
}

export function reaggregateMetaMetrics(campaigns: Array<Record<string, unknown>>): MetaAccountMetrics {
  const impressions = campaigns.reduce((s, c) => s + Number(c.impressions || 0), 0)
  const clicks = campaigns.reduce((s, c) => s + Number(c.clicks || 0), 0)
  const spend = campaigns.reduce((s, c) => s + Number(c.spend || 0), 0)
  const reach = campaigns.reduce((s, c) => s + Number(c.reach || 0), 0)
  const results = campaigns.reduce((s, c) => s + Number(c.results || 0), 0)
  const roasValues = campaigns
    .map(c => c.roas)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const roas
    = spend > 0 && roasValues.length
      ? campaigns.reduce((s, c) => s + (Number(c.roas || 0) * Number(c.spend || 0)), 0) / spend
      : (roasValues[0] ?? null)
  const rates = derivedRates(impressions, clicks, spend)
  return {
    impressions,
    clicks,
    spend,
    reach,
    ...rates,
    results,
    roas: roas != null && !Number.isNaN(roas) ? roas : null,
    cost_per_result: results > 0 ? spend / results : 0,
  }
}

/**
 * Period KPI additive metrics = sum of the daily breakdown (same `lead` / result type).
 * Reach stays unique from the account-level row. Empty series keeps the account totals
 * (Graph `time_increment` failure) instead of inventing zeros.
 */
export function overlayAccountMetricsWithDailySum(
  account: MetaAccountMetrics,
  series: Array<Pick<MetaDailyInsightPoint, 'impressions' | 'clicks' | 'spend' | 'results'>>,
): MetaAccountMetrics {
  if (!series.length)
    return account

  const impressions = series.reduce((s, row) => s + Number(row.impressions || 0), 0)
  const clicks = series.reduce((s, row) => s + Number(row.clicks || 0), 0)
  const spend = series.reduce((s, row) => s + Number(row.spend || 0), 0)
  const results = series.reduce((s, row) => s + Number(row.results || 0), 0)
  const rates = derivedRates(impressions, clicks, spend)

  return {
    ...account,
    impressions,
    clicks,
    spend,
    ...rates,
    results,
    cost_per_result: results > 0 ? spend / results : 0,
  }
}
