import {
  getReportTemplate,
  normalizeAnalyticsTemplateId,
  normalizeGoogleAdsTemplateId,
  normalizeMetaTemplateId,
} from '~/constants/marketing-report-templates'
import {
  // Alias avoids Nitro dual auto-import of the same symbol from google-ads + this file.
  extractGoogleAdsErrorMessage,
  getGoogleAccessToken as getGoogleOAuthAccessToken,
  googleAdsApiUrl,
  googleAdsSearchHeaders,
  normalizeGoogleCustomerId,
  resolveGoogleAdsDeveloperToken,
} from '~/server/utils/google-ads'
import { decryptSecret } from '~/server/utils/marketing'
import type {
  AnalyticsOverviewBlock,
  AnalyticsReportTemplateId,
  GoogleAdsOverviewBlock,
  GoogleAdsReportTemplateId,
  MetaReportTemplateId,
} from '~/types/marketing-reports'

export function utcYmd(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function buildGoogleDateWhere(datePreset: string, dateStart: string, dateEnd: string) {
  if (datePreset === 'custom' && dateStart && dateEnd)
    return `segments.date BETWEEN '${dateStart}' AND '${dateEnd}'`
  if (datePreset === 'today')
    return `segments.date = '${utcYmd(new Date())}'`
  if (datePreset === 'yesterday') {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return `segments.date = '${utcYmd(d)}'`
  }
  const map: Record<string, string> = {
    last_7d: 'LAST_7_DAYS',
    last_14d: 'LAST_14_DAYS',
    last_30d: 'LAST_30_DAYS',
    last_90d: 'LAST_90_DAYS',
  }
  const dr = map[datePreset] || 'LAST_30_DAYS'
  return `segments.date DURING ${dr}`
}

export function buildGa4DateRange(datePreset: string, dateStart: string, dateEnd: string) {
  if (datePreset === 'custom' && dateStart && dateEnd)
    return { startDate: dateStart, endDate: dateEnd }
  if (datePreset === 'today')
    return { startDate: 'today', endDate: 'today' }
  if (datePreset === 'yesterday')
    return { startDate: 'yesterday', endDate: 'yesterday' }
  const map: Record<string, { startDate: string, endDate: string }> = {
    last_7d: { startDate: '7daysAgo', endDate: 'today' },
    last_14d: { startDate: '14daysAgo', endDate: 'today' },
    last_30d: { startDate: '30daysAgo', endDate: 'today' },
    last_90d: { startDate: '90daysAgo', endDate: 'today' },
  }
  return map[datePreset] || { startDate: '30daysAgo', endDate: 'today' }
}

function parseGa4RelativeDate(token: string, today = new Date()): string {
  const t = String(token || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t))
    return t
  if (t === 'today')
    return utcYmd(today)
  if (t === 'yesterday') {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - 1)
    return utcYmd(d)
  }
  const daysAgo = t.match(/^(\d+)daysAgo$/i)
  if (daysAgo) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - Number(daysAgo[1]))
    return utcYmd(d)
  }
  return utcYmd(today)
}

/** Concrete YYYY-MM-DD range for GA4 (needed to compute the previous period). */
export function resolveAbsoluteDateRange(
  datePreset: string,
  dateStart: string,
  dateEnd: string,
): { start: string, end: string } {
  const range = buildGa4DateRange(datePreset, dateStart, dateEnd)
  return {
    start: parseGa4RelativeDate(range.startDate),
    end: parseGa4RelativeDate(range.endDate),
  }
}

/** Previous period of equal length, ending the day before `start`. */
export function previousAbsoluteDateRange(start: string, end: string): { start: string, end: string } {
  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)
  const dayMs = 86_400_000
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1)
  const prevEnd = new Date(startDate)
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1))
  return { start: utcYmd(prevStart), end: utcYmd(prevEnd) }
}

export function buildGooglePreviousDateWhere(datePreset: string, dateStart: string, dateEnd: string) {
  const abs = resolveAbsoluteDateRange(datePreset, dateStart, dateEnd)
  const prev = previousAbsoluteDateRange(abs.start, abs.end)
  return `segments.date BETWEEN '${prev.start}' AND '${prev.end}'`
}

export function metricDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous))
    return null
  if (previous === 0 && current === 0)
    return null
  if (previous === 0)
    return current > 0 ? 100 : (current < 0 ? -100 : null)
  return ((current - previous) / Math.abs(previous)) * 100
}

export function buildMetricDeltas(
  current: Record<string, number | null | undefined>,
  previous: Record<string, number | null | undefined> | null | undefined,
  keys: string[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  if (!previous) {
    for (const key of keys)
      out[key] = null
    return out
  }
  for (const key of keys)
    out[key] = metricDeltaPct(Number(current[key] || 0), Number(previous[key] || 0))
  return out
}

function emptyGoogleBlock(
  connected: boolean,
  extras?: Partial<Pick<GoogleAdsOverviewBlock, 'customer_id' | 'needs_account' | 'error'>>,
): GoogleAdsOverviewBlock {
  return {
    connected,
    customer_id: extras?.customer_id ?? null,
    needs_account: extras?.needs_account ?? false,
    error: extras?.error ?? null,
    metrics: {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversions_value: 0,
      ctr: 0,
      cpc: 0,
      cost_per_conversion: null,
      roas: null,
    },
    previous_metrics: null,
    deltas: null,
    campaigns: [],
    series: [],
    networks: [],
  }
}

function extractGoogleAdsSearchResults(response: unknown): any[] {
  if (!response)
    return []
  if (Array.isArray(response))
    return response.flatMap((chunk: any) => chunk?.results || [])
  if (typeof response === 'object' && Array.isArray((response as any).results))
    return (response as any).results
  return []
}

async function runGoogleAdsSearch(
  customerId: string,
  headers: Record<string, string>,
  query: string,
): Promise<{ results: any[], error: string | null }> {
  try {
    const response = await $fetch<any>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:search`),
      { method: 'POST', headers, body: { query } },
    )
    return { results: extractGoogleAdsSearchResults(response), error: null }
  }
  catch (error: any) {
    const message = extractGoogleAdsErrorMessage(error)
    console.warn('[marketing-reports] google_ads search failed', {
      customerId,
      status: error?.statusCode || error?.status || null,
      message,
    })
    return { results: [], error: message }
  }
}

function mapGoogleCampaignRow(row: any) {
  const impressions = Number(row.metrics?.impressions || 0)
  const clicks = Number(row.metrics?.clicks || 0)
  const cost = Number(row.metrics?.costMicros || row.metrics?.cost_micros || 0) / 1_000_000
  const conversions = Number(row.metrics?.conversions || 0)
  const conversionsValue = Number(
    row.metrics?.conversionsValue || row.metrics?.conversions_value || 0,
  )
  const ctr = Number(row.metrics?.ctr || 0) * (Number(row.metrics?.ctr || 0) <= 1 ? 100 : 1)
    || (impressions > 0 ? (clicks / impressions) * 100 : 0)
  const cpcMicros = Number(row.metrics?.averageCpc || row.metrics?.average_cpc || 0)
  const cpc = cpcMicros > 0 ? cpcMicros / 1_000_000 : (clicks > 0 ? cost / clicks : 0)
  const costPerConversion
    = conversions > 0
      ? cost / conversions
      : null

  return {
    id: String(row.campaign?.id || ''),
    name: row.campaign?.name,
    status: row.campaign?.status ? String(row.campaign.status) : null,
    channel: String(
      row.campaign?.advertisingChannelType
      || row.campaign?.advertising_channel_type
      || '',
    ).toUpperCase() || null,
    impressions,
    clicks,
    cost,
    conversions,
    conversions_value: conversionsValue,
    ctr,
    cpc,
    cost_per_conversion: costPerConversion,
  }
}

function aggregateGoogleCampaigns(campaigns: ReturnType<typeof mapGoogleCampaignRow>[]) {
  const metrics = campaigns.reduce(
    (acc, c) => {
      acc.impressions += c.impressions
      acc.clicks += c.clicks
      acc.cost += c.cost
      acc.conversions += c.conversions
      acc.conversions_value += c.conversions_value
      return acc
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 },
  )
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0
  const cpc = metrics.clicks > 0 ? metrics.cost / metrics.clicks : 0
  const cost_per_conversion
    = metrics.conversions > 0 ? metrics.cost / metrics.conversions : null
  const roas
    = metrics.cost > 0 && metrics.conversions_value > 0
      ? metrics.conversions_value / metrics.cost
      : null

  return {
    ...metrics,
    ctr,
    cpc,
    cost_per_conversion,
    roas,
  }
}

function filterGoogleByTemplate(
  campaigns: ReturnType<typeof mapGoogleCampaignRow>[],
  templateId: GoogleAdsReportTemplateId,
) {
  const template = getReportTemplate('google_ads', templateId)
  const channels = template.googleAds?.channelTypes || []
  if (!channels.length)
    return campaigns
  return campaigns.filter((c) => {
    const ch = String(c.channel || '').toUpperCase()
    return channels.some(t => ch === t || ch.includes(t))
  })
}

function aggregateGoogleNetworks(campaigns: ReturnType<typeof mapGoogleCampaignRow>[]) {
  const byChannel = new Map<string, ReturnType<typeof mapGoogleCampaignRow>[]>()
  for (const c of campaigns) {
    const key = String(c.channel || 'UNKNOWN').toUpperCase()
    const list = byChannel.get(key) || []
    list.push(c)
    byChannel.set(key, list)
  }
  return [...byChannel.entries()]
    .map(([network, rows]) => {
      const m = aggregateGoogleCampaigns(rows)
      return {
        network,
        impressions: m.impressions,
        clicks: m.clicks,
        cost: m.cost,
        conversions: m.conversions,
        conversions_value: m.conversions_value,
        ctr: m.ctr,
        cpc: m.cpc,
        cost_per_conversion: m.cost_per_conversion,
      }
    })
    .sort((a, b) => b.cost - a.cost)
}

const GOOGLE_DELTA_KEYS = [
  'impressions',
  'clicks',
  'cost',
  'conversions',
  'conversions_value',
  'ctr',
  'cpc',
  'cost_per_conversion',
  'roas',
] as const

export async function fetchGoogleAdsReportData(
  config: Record<string, any>,
  dateOpts: { datePreset: string, dateStart: string, dateEnd: string },
  templateRaw?: string | null,
): Promise<GoogleAdsOverviewBlock> {
  const templateId = normalizeGoogleAdsTemplateId(templateRaw)
  const customerId = normalizeGoogleCustomerId(config.customer_id)
  const developerToken = resolveGoogleAdsDeveloperToken(config)
  const accessToken = await getGoogleOAuthAccessToken(config)
  const hasOauth = Boolean(
    decryptSecret(config.access_token_enc) || decryptSecret(config.refresh_token_enc),
  )

  if (!hasOauth)
    return emptyGoogleBlock(false)

  if (!customerId) {
    return emptyGoogleBlock(true, {
      needs_account: true,
      error: 'Selecione a conta de anúncios na integração do Google Ads.',
    })
  }

  if (!developerToken) {
    return emptyGoogleBlock(true, {
      customer_id: customerId,
      error: 'Google Ads sem developer token no servidor (GOOGLE_ADS_DEVELOPER_TOKEN).',
    })
  }

  if (!accessToken) {
    return emptyGoogleBlock(true, {
      customer_id: customerId,
      error: 'Sessão Google expirada. Reconecte o Google Ads em Integrações.',
    })
  }

  // Direct access only — no login-customer-id / platform MCC header.
  const headers = googleAdsSearchHeaders(accessToken, developerToken)
  const dateWhere = buildGoogleDateWhere(dateOpts.datePreset, dateOpts.dateStart, dateOpts.dateEnd)
  const previousDateWhere = buildGooglePreviousDateWhere(
    dateOpts.datePreset,
    dateOpts.dateStart,
    dateOpts.dateEnd,
  )

  const campaignSelect = `
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
  `

  const campaignQuery = `
    SELECT
      ${campaignSelect}
    FROM campaign
    WHERE ${dateWhere}
      AND campaign.status != 'REMOVED'
  `

  const previousCampaignQuery = `
    SELECT
      ${campaignSelect}
    FROM campaign
    WHERE ${previousDateWhere}
      AND campaign.status != 'REMOVED'
  `

  const dailyQuery = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE ${dateWhere}
  `

  const [campaignResult, dailyResult, previousResult] = await Promise.all([
    runGoogleAdsSearch(customerId, headers, campaignQuery),
    runGoogleAdsSearch(customerId, headers, dailyQuery),
    runGoogleAdsSearch(customerId, headers, previousCampaignQuery),
  ])

  const apiError = campaignResult.error || dailyResult.error
  if (apiError && !campaignResult.results.length && !dailyResult.results.length) {
    return emptyGoogleBlock(true, {
      customer_id: customerId,
      error: apiError,
    })
  }

  if (campaignResult.error) {
    console.warn('[marketing-reports] google_ads campaigns skipped', {
      customerId,
      message: campaignResult.error,
    })
  }
  if (dailyResult.error) {
    console.warn('[marketing-reports] google_ads series skipped', {
      customerId,
      message: dailyResult.error,
    })
  }
  if (previousResult.error) {
    console.warn('[marketing-reports] google_ads previous period skipped', {
      customerId,
      message: previousResult.error,
    })
  }

  const allCampaigns = campaignResult.results.map(mapGoogleCampaignRow)
  const campaigns = filterGoogleByTemplate(allCampaigns, templateId)
  const metrics = aggregateGoogleCampaigns(campaigns)

  const previousCampaigns = filterGoogleByTemplate(
    previousResult.results.map(mapGoogleCampaignRow),
    templateId,
  )
  const previous_metrics = previousResult.error && !previousResult.results.length
    ? null
    : aggregateGoogleCampaigns(previousCampaigns)

  const deltas = previous_metrics
    ? buildMetricDeltas(
        metrics as unknown as Record<string, number | null>,
        previous_metrics as unknown as Record<string, number | null>,
        [...GOOGLE_DELTA_KEYS],
      )
    : null

  const series = dailyResult.results
    .map((row: any) => ({
      date: String(row.segments?.date || ''),
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      cost: Number(row.metrics?.costMicros || row.metrics?.cost_micros || 0) / 1_000_000,
      conversions: Number(row.metrics?.conversions || 0),
      conversions_value: Number(
        row.metrics?.conversionsValue || row.metrics?.conversions_value || 0,
      ),
    }))
    .filter((r: { date: string }) => Boolean(r.date))
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))

  return {
    connected: true,
    customer_id: customerId,
    needs_account: false,
    error: null,
    metrics,
    previous_metrics,
    deltas,
    campaigns,
    series,
    networks: aggregateGoogleNetworks(campaigns),
  }
}

function emptyAnalyticsBlock(
  connected: boolean,
  extras?: Partial<Pick<AnalyticsOverviewBlock, 'property_id' | 'needs_property' | 'error'>>,
): AnalyticsOverviewBlock {
  return {
    connected,
    property_id: extras?.property_id || null,
    needs_property: extras?.needs_property ?? false,
    error: extras?.error ?? null,
    metrics: {
      sessions: 0,
      totalUsers: 0,
      newUsers: 0,
      screenPageViews: 0,
      engagedSessions: 0,
      engagementRate: 0,
      averageSessionDuration: 0,
      bounceRate: 0,
      eventCount: 0,
      conversions: 0,
      ecommercePurchases: 0,
      purchaseRevenue: 0,
    },
    previous_metrics: null,
    deltas: null,
    series: [],
    breakdown: [],
    pages: [],
    devices: [],
    events: [],
  }
}

function metricMapFromGa4Row(metricHeaders: any[], values: any[]) {
  const map: Record<string, number> = {}
  for (let i = 0; i < metricHeaders.length; i++) {
    const name = String(metricHeaders[i]?.name || '')
    map[name] = Number(values[i]?.value || 0)
  }
  // UI templates still use `conversions`; GA4 API exposes `keyEvents`.
  if (map.keyEvents != null && map.conversions == null)
    map.conversions = map.keyEvents
  return map
}

function normalizeEngagementRate(raw: number) {
  // GA4 returns engagementRate / bounceRate as a fraction (0–1)
  if (raw >= 0 && raw <= 1)
    return raw * 100
  return raw
}

function toGa4ApiMetricName(name: string): string {
  if (name === 'conversions')
    return 'keyEvents'
  return name
}

/**
 * GA4 Data API hard-limit: max 10 metrics per request (including nested
 * metricAggregations TOTAL). Keep core and ecommerce in separate calls.
 */
const GA4_CORE_API_METRICS = [
  'sessions',
  'totalUsers',
  'newUsers',
  'screenPageViews',
  'engagedSessions',
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'eventCount',
  'keyEvents',
] as const

const GA4_ECOMMERCE_API_METRICS = [
  'ecommercePurchases',
  'purchaseRevenue',
] as const

const GA4_MAX_METRICS_PER_REQUEST = 10

/**
 * GA4 Data API expects a numeric property id only (not Measurement ID G-XXXX,
 * not account id labels, not a duplicated `properties/` prefix).
 */
export function normalizeGa4PropertyId(value?: string | null): string | null {
  let raw = String(value || '').trim()
  if (!raw)
    return null

  raw = raw.replace(/^(properties\/)+/i, '').trim()

  if (/^G-[A-Z0-9]+$/i.test(raw))
    return null

  if (/^\d+$/.test(raw))
    return raw

  const trailingDigits = raw.match(/(\d{6,})\s*$/)
  if (trailingDigits)
    return trailingDigits[1]

  return null
}

function extractGa4ErrorDetails(error: any): {
  status: number | null
  googleStatus: string | null
  message: string
  reason: string | null
} {
  const status = Number(error?.statusCode || error?.status || 0) || null
  const payload = error?.data?.error || error?.data || {}
  const message = String(payload?.message || error?.message || '')
  const googleStatus = String(payload?.status || '') || null
  const details = Array.isArray(payload?.details) ? payload.details : []
  const reason = String(
    details.find((d: any) => d?.reason)?.reason
    || details.find((d: any) => d?.['@type']?.includes?.('ErrorInfo'))?.reason
    || '',
  ) || null
  return { status, googleStatus, message, reason }
}

/** Parse metric API name from Google INVALID_ARGUMENT messages when present. */
export function extractInvalidGa4MetricName(message: string): string | null {
  const patterns = [
    /\b([a-zA-Z][a-zA-Z0-9_]*)\s+is not a valid metric\b/i,
    /Field\s+([a-zA-Z][a-zA-Z0-9_]*)\s+is not a valid metric\b/i,
    /Unknown metric[:\s]+[`'"]?([a-zA-Z][a-zA-Z0-9_]*)[`'"]?/i,
    /metric name[:\s]+[`'"]?([a-zA-Z][a-zA-Z0-9_]*)[`'"]?/i,
    /did you mean\s+[`'"]?([a-zA-Z][a-zA-Z0-9_]*)[`'"]?/i,
  ]
  for (const re of patterns) {
    const match = message.match(re)
    if (match?.[1])
      return match[1]
  }
  return null
}

function extractGa4ErrorMessage(error: any): string {
  const { status, googleStatus, message, reason } = extractGa4ErrorDetails(error)
  const blob = `${reason || ''} ${googleStatus || ''} ${message}`
  const safeDetail = message && !/^\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/i.test(message)
    ? message.replace(/\s+/g, ' ').trim().slice(0, 220)
    : ''

  if (
    status === 401
    || /UNAUTHENTICATED/i.test(blob)
    || /invalid.?authentication|invalid.?credentials|access.?token/i.test(message)
  ) {
    return 'Sessão Google expirada. Reconecte o Google Analytics em Integrações.'
  }

  // 403 SERVICE_DISABLED is often mislabeled as "permission" — Data API must be enabled
  // on the GCP project that owns GOOGLE_CLIENT_ID (Admin API can work while Data API is off).
  if (
    /SERVICE_DISABLED|ACCESS_TOKEN_SCOPE_INSUFFICIENT|API_KEY_SERVICE_BLOCKED/i.test(blob)
    || /has not been used in project|it is disabled|Enable it by visiting/i.test(message)
  ) {
    if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(blob)) {
      return 'Token Google sem escopo analytics.readonly. Reconecte o Google Analytics (não o Ads) em Integrações.'
    }
    return 'API Google Analytics Data desativada no projeto Google Cloud do OAuth. Ative "Google Analytics Data API" no Console e tente de novo.'
  }

  if (/limited to 10 metrics/i.test(message)) {
    return `Consulta GA4 excedeu o limite de 10 métricas por requisição.${safeDetail ? ` ${safeDetail}` : ''}`
  }

  const invalidMetric = extractInvalidGa4MetricName(message)
  if (
    invalidMetric
    || /is not a valid metric|Unknown metric|not found for compatibility/i.test(message)
  ) {
    if (invalidMetric)
      return `Métrica inválida na consulta GA4: ${invalidMetric}.${safeDetail ? ` ${safeDetail}` : ''}`
    return `Métrica inválida na consulta GA4.${safeDetail ? ` ${safeDetail}` : ''}`
  }

  if (/INVALID_ARGUMENT/i.test(blob)) {
    return `Argumento inválido na consulta GA4.${safeDetail ? ` ${safeDetail}` : ''}`
  }

  if (
    status === 403
    || /PERMISSION_DENIED/i.test(blob)
    || /sufficient permissions for this property/i.test(message)
  ) {
    const detail = safeDetail ? ` (${safeDetail.slice(0, 180)})` : ''
    return `Sem permissão para esta propriedade GA4. Confira o acesso do usuário OAuth e o property_id numérico.${detail}`
  }

  if (safeDetail)
    return safeDetail.slice(0, 280)

  return 'Falha ao consultar a API do Google Analytics.'
}

async function runGa4Report(
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
  label: string,
): Promise<{ data: any | null, error: string | null }> {
  try {
    const data = await $fetch<any>(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    })
    return { data, error: null }
  }
  catch (error: any) {
    const details = extractGa4ErrorDetails(error)
    const message = extractGa4ErrorMessage(error)
    console.warn('[marketing-reports] google_analytics runReport failed', {
      label,
      status: details.status,
      googleStatus: details.googleStatus,
      reason: details.reason,
      googleMessage: details.message ? details.message.slice(0, 300) : null,
      message,
    })
    return { data: null, error: message }
  }
}

const ANALYTICS_DELTA_KEYS = [
  'sessions',
  'totalUsers',
  'newUsers',
  'screenPageViews',
  'engagedSessions',
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'eventCount',
  'conversions',
  'ecommercePurchases',
  'purchaseRevenue',
] as const

function mapAnalyticsTotals(m: Record<string, number>) {
  return {
    sessions: m.sessions || 0,
    totalUsers: m.totalUsers || 0,
    newUsers: m.newUsers || 0,
    screenPageViews: m.screenPageViews || 0,
    engagedSessions: m.engagedSessions || 0,
    engagementRate: normalizeEngagementRate(m.engagementRate || 0),
    averageSessionDuration: m.averageSessionDuration || 0,
    bounceRate: normalizeEngagementRate(m.bounceRate || 0),
    eventCount: m.eventCount || 0,
    conversions: m.conversions || m.keyEvents || 0,
    ecommercePurchases: m.ecommercePurchases || 0,
    purchaseRevenue: m.purchaseRevenue || 0,
  }
}

function mapGa4BreakdownRows(
  data: any | null,
  opts?: { includeViews?: boolean },
) {
  return (data?.rows || []).map((row: any) => {
    const mm = metricMapFromGa4Row(data?.metricHeaders || [], row.metricValues || [])
    return {
      dimension: String(row.dimensionValues?.[0]?.value || '(não definido)'),
      sessions: mm.sessions || 0,
      totalUsers: mm.totalUsers || 0,
      engagementRate: normalizeEngagementRate(mm.engagementRate || 0),
      conversions: mm.conversions || mm.keyEvents || 0,
      purchaseRevenue: mm.purchaseRevenue || 0,
      ...(opts?.includeViews ? { screenPageViews: mm.screenPageViews || 0 } : {}),
    }
  })
}

export async function fetchAnalyticsReportData(
  config: Record<string, any>,
  dateOpts: { datePreset: string, dateStart: string, dateEnd: string },
  templateRaw?: string | null,
): Promise<AnalyticsOverviewBlock> {
  const templateId = normalizeAnalyticsTemplateId(templateRaw) as AnalyticsReportTemplateId
  const template = getReportTemplate('google_analytics', templateId)
  const rawPropertyId = String(config.property_id || config.analytics_account_id || '').trim()
  const propertyId = normalizeGa4PropertyId(rawPropertyId)
  const accessToken = await getGoogleOAuthAccessToken(config)
  const hasOauth = Boolean(
    decryptSecret(config.access_token_enc) || decryptSecret(config.refresh_token_enc),
  )

  if (!hasOauth)
    return emptyAnalyticsBlock(false)

  if (!rawPropertyId) {
    return emptyAnalyticsBlock(true, {
      needs_property: true,
      error: 'Selecione a propriedade GA4 na integração do Google Analytics.',
    })
  }

  if (!propertyId) {
    return emptyAnalyticsBlock(true, {
      property_id: rawPropertyId,
      needs_property: true,
      error: 'ID de propriedade GA4 inválido. Use o ID numérico da propriedade (não o Measurement ID G-XXXX). Reescolha a propriedade em Integrações.',
    })
  }

  if (!accessToken) {
    return emptyAnalyticsBlock(true, {
      property_id: propertyId,
      error: 'Sessão Google expirada. Reconecte o Google Analytics em Integrações.',
    })
  }

  const dateRange = buildGa4DateRange(dateOpts.datePreset, dateOpts.dateStart, dateOpts.dateEnd)
  const absolute = resolveAbsoluteDateRange(dateOpts.datePreset, dateOpts.dateStart, dateOpts.dateEnd)
  const previousAbs = previousAbsoluteDateRange(absolute.start, absolute.end)
  const previousRange = { startDate: previousAbs.start, endDate: previousAbs.end }
  const templateMetricNames = (template.analytics?.metricNames || []).map(toGa4ApiMetricName)

  // Universal metrics only (≤10). Ecommerce goes in a separate request.
  const coreMetrics = [...GA4_CORE_API_METRICS]
  if (coreMetrics.length > GA4_MAX_METRICS_PER_REQUEST) {
    coreMetrics.length = GA4_MAX_METRICS_PER_REQUEST
  }

  const wantsEcommerce = templateMetricNames.some(name =>
    (GA4_ECOMMERCE_API_METRICS as readonly string[]).includes(name),
  ) || templateId === 'overview' || templateId === 'ecommerce' || templateId === 'acquisition'

  const ecommerceMetrics = wantsEcommerce
    ? [...GA4_ECOMMERCE_API_METRICS]
    : []

  const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`

  const seriesMetricsWithRevenue = [
    'sessions',
    'totalUsers',
    'screenPageViews',
    'engagementRate',
    'keyEvents',
    'purchaseRevenue',
  ]
  const seriesMetricsCore = [
    'sessions',
    'totalUsers',
    'screenPageViews',
    'engagementRate',
    'keyEvents',
  ]
  const breakdownMetricsWithRevenue = [
    'sessions',
    'totalUsers',
    'engagementRate',
    'keyEvents',
    'purchaseRevenue',
  ]
  const breakdownMetricsCore = [
    'sessions',
    'totalUsers',
    'engagementRate',
    'keyEvents',
  ]
  const pageMetrics = [
    'sessions',
    'totalUsers',
    'screenPageViews',
    'engagementRate',
    'keyEvents',
  ]
  const deviceMetrics = [
    'sessions',
    'totalUsers',
    'engagementRate',
    'keyEvents',
  ]
  const eventMetrics = [
    'eventCount',
    'keyEvents',
  ]

  const channelDimensions = template.analytics?.dimensionNames?.length
    ? template.analytics.dimensionNames
    : ['sessionDefaultChannelGroup']

  const [
    totalsRes,
    ecommerceRes,
    previousTotalsRes,
    previousEcommerceRes,
    seriesPrimary,
    breakdownPrimary,
    pagesRes,
    devicesRes,
    eventsRes,
  ] = await Promise.all([
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      metrics: coreMetrics.map(name => ({ name })),
      metricAggregations: ['TOTAL'],
    }, 'totals'),
    ecommerceMetrics.length
      ? runGa4Report(`${baseUrl}:runReport`, accessToken, {
          dateRanges: [dateRange],
          metrics: ecommerceMetrics.map(name => ({ name })),
          metricAggregations: ['TOTAL'],
        }, 'ecommerce')
      : Promise.resolve({ data: null, error: null as string | null }),
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [previousRange],
      metrics: coreMetrics.map(name => ({ name })),
      metricAggregations: ['TOTAL'],
    }, 'totals-previous'),
    ecommerceMetrics.length
      ? runGa4Report(`${baseUrl}:runReport`, accessToken, {
          dateRanges: [previousRange],
          metrics: ecommerceMetrics.map(name => ({ name })),
          metricAggregations: ['TOTAL'],
        }, 'ecommerce-previous')
      : Promise.resolve({ data: null, error: null as string | null }),
    // Series: date dimension only + ≤6 safe metrics (purchaseRevenue optional).
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'date' }],
      metrics: seriesMetricsWithRevenue.map(name => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 90,
    }, 'series'),
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: channelDimensions.map(name => ({ name })),
      metrics: breakdownMetricsWithRevenue.map(name => ({ name })),
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 12,
    }, 'breakdown'),
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }],
      metrics: pageMetrics.map(name => ({ name })),
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 12,
    }, 'pages'),
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: deviceMetrics.map(name => ({ name })),
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }, 'devices'),
    runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'eventName' }],
      metrics: eventMetrics.map(name => ({ name })),
      orderBys: [{ metric: { metricName: 'keyEvents' }, desc: true }],
      limit: 12,
    }, 'events'),
  ])

  // Degrade series/breakdown without purchaseRevenue if ecommerce metric is rejected.
  let seriesRes = seriesPrimary
  if (!seriesRes.data && seriesRes.error && /purchaseRevenue|métrica inválida|invalid/i.test(seriesRes.error)) {
    seriesRes = await runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'date' }],
      metrics: seriesMetricsCore.map(name => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 90,
    }, 'series-core')
  }

  let breakdownRes = breakdownPrimary
  if (
    !breakdownRes.data
    && breakdownRes.error
    && /purchaseRevenue|métrica inválida|invalid/i.test(breakdownRes.error)
  ) {
    breakdownRes = await runGa4Report(`${baseUrl}:runReport`, accessToken, {
      dateRanges: [dateRange],
      dimensions: channelDimensions.map(name => ({ name })),
      metrics: breakdownMetricsCore.map(name => ({ name })),
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 12,
    }, 'breakdown-core')
  }

  const apiError = totalsRes.error
  if (!totalsRes.data && apiError) {
    return emptyAnalyticsBlock(true, {
      property_id: propertyId,
      error: apiError,
    })
  }

  // Optional secondary reports: degrade individually.
  for (const [label, res] of [
    ['ecommerce', ecommerceRes],
    ['totals-previous', previousTotalsRes],
    ['ecommerce-previous', previousEcommerceRes],
    ['series', seriesRes],
    ['breakdown', breakdownRes],
    ['pages', pagesRes],
    ['devices', devicesRes],
    ['events', eventsRes],
  ] as const) {
    if (res.error) {
      console.warn('[marketing-reports] google_analytics secondary skipped', {
        propertyId,
        label,
        message: res.error,
      })
    }
  }

  const headers = totalsRes.data?.metricHeaders || []
  const totalsRow
    = (totalsRes.data?.totals && totalsRes.data.totals[0]?.metricValues)
      || (totalsRes.data?.rows && totalsRes.data.rows[0]?.metricValues)
      || []
  const m = metricMapFromGa4Row(headers, totalsRow)

  if (ecommerceRes.data) {
    const ecomHeaders = ecommerceRes.data?.metricHeaders || []
    const ecomRow
      = (ecommerceRes.data?.totals && ecommerceRes.data.totals[0]?.metricValues)
        || (ecommerceRes.data?.rows && ecommerceRes.data.rows[0]?.metricValues)
        || []
    Object.assign(m, metricMapFromGa4Row(ecomHeaders, ecomRow))
  }

  let previousMap: Record<string, number> | null = null
  if (previousTotalsRes.data) {
    const prevHeaders = previousTotalsRes.data?.metricHeaders || []
    const prevRow
      = (previousTotalsRes.data?.totals && previousTotalsRes.data.totals[0]?.metricValues)
        || (previousTotalsRes.data?.rows && previousTotalsRes.data.rows[0]?.metricValues)
        || []
    previousMap = metricMapFromGa4Row(prevHeaders, prevRow)
    if (previousEcommerceRes.data) {
      const ecomHeaders = previousEcommerceRes.data?.metricHeaders || []
      const ecomRow
        = (previousEcommerceRes.data?.totals && previousEcommerceRes.data.totals[0]?.metricValues)
          || (previousEcommerceRes.data?.rows && previousEcommerceRes.data.rows[0]?.metricValues)
          || []
      Object.assign(previousMap, metricMapFromGa4Row(ecomHeaders, ecomRow))
    }
  }

  const metrics = mapAnalyticsTotals(m)
  const previous_metrics = previousMap ? mapAnalyticsTotals(previousMap) : null
  const deltas = previous_metrics
    ? buildMetricDeltas(
        metrics as unknown as Record<string, number | null>,
        previous_metrics as unknown as Record<string, number | null>,
        [...ANALYTICS_DELTA_KEYS],
      )
    : null

  const series = (seriesRes.data?.rows || []).map((row: any) => {
    const dim = String(row.dimensionValues?.[0]?.value || '')
    const date
      = dim.length === 8
        ? `${dim.slice(0, 4)}-${dim.slice(4, 6)}-${dim.slice(6, 8)}`
        : dim
    const mm = metricMapFromGa4Row(seriesRes.data?.metricHeaders || [], row.metricValues || [])
    return {
      date,
      sessions: mm.sessions || 0,
      totalUsers: mm.totalUsers || 0,
      screenPageViews: mm.screenPageViews || 0,
      engagementRate: normalizeEngagementRate(mm.engagementRate || 0),
      conversions: mm.conversions || mm.keyEvents || 0,
      purchaseRevenue: mm.purchaseRevenue || 0,
    }
  })

  const breakdown = mapGa4BreakdownRows(breakdownRes.data)
  const pages = mapGa4BreakdownRows(pagesRes.data, { includeViews: true })
  const devices = mapGa4BreakdownRows(devicesRes.data)

  const events = (eventsRes.data?.rows || [])
    .map((row: any) => {
      const mm = metricMapFromGa4Row(eventsRes.data?.metricHeaders || [], row.metricValues || [])
      return {
        name: String(row.dimensionValues?.[0]?.value || '(não definido)'),
        eventCount: mm.eventCount || 0,
        keyEvents: mm.keyEvents || mm.conversions || 0,
      }
    })
    .filter((row: { keyEvents: number, eventCount: number }) => row.keyEvents > 0 || row.eventCount > 0)
    .sort((a: { keyEvents: number, eventCount: number }, b: { keyEvents: number, eventCount: number }) => {
      if (b.keyEvents !== a.keyEvents)
        return b.keyEvents - a.keyEvents
      return b.eventCount - a.eventCount
    })
    .slice(0, 10)

  return {
    connected: true,
    property_id: propertyId,
    needs_property: false,
    error: null,
    metrics,
    previous_metrics,
    deltas,
    series,
    breakdown,
    pages,
    devices,
    events,
  }
}

/** Action-type priority lists aligned to Meta Insights `actions` / CTWA docs */
export function resultActionPriorityForMetaTemplate(templateId: MetaReportTemplateId): string[] {
  const id = normalizeMetaTemplateId(templateId)
  const messaging = [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_conversation_started_1d',
    'onsite_conversion.messaging_first_reply',
    'onsite_conversion.messaging_user_depth_7d',
    'onsite_conversion.whatsapp_conversation_started_7d',
    'onsite_conversion.whatsapp_first_message',
    'messaging_conversation_started_7d',
    'messaging_conversation_started',
    'messaging_first_reply',
    'whatsapp_conversation_started_7d',
    'whatsapp_first_message',
  ]
  const purchase = [
    'purchase',
    'onsite_conversion.purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]
  const lead = [
    'lead',
    'onsite_conversion.lead',
    'offsite_conversion.fb_pixel_lead',
    'complete_registration',
    'submit_application',
  ]
  const engagement = [
    'post_engagement',
    'page_engagement',
    'video_view',
    'like',
    'comment',
    'post',
    'post_reaction',
  ]
  const traffic = [
    'landing_page_view',
    'link_click',
    'omni_landing_page_view',
  ]

  switch (id) {
    case 'whatsapp':
      return messaging
    case 'ecommerce':
      return purchase
    case 'leads':
      return lead
    case 'engagement':
      return engagement
    case 'traffic':
      return traffic
    case 'awareness':
      return ['video_view', ...engagement]
    default:
      return [...messaging, ...lead, ...purchase, 'complete_registration', 'submit_application']
  }
}

export function fuzzyGroupsForMetaTemplate(templateId: MetaReportTemplateId): string[] {
  const id = normalizeMetaTemplateId(templateId)
  switch (id) {
    case 'whatsapp':
      return ['messaging', 'whatsapp']
    case 'ecommerce':
      return ['purchase']
    case 'leads':
      return ['lead', 'complete_registration', 'submit_application']
    case 'engagement':
      return ['post_engagement', 'page_engagement', 'video_view', 'like', 'comment']
    case 'traffic':
      return ['landing_page_view', 'link_click']
    case 'awareness':
      return ['video_view', 'reach']
    default:
      return ['messaging', 'whatsapp', 'lead', 'purchase', 'complete_registration', 'submit_application']
  }
}

export function campaignMatchesMetaTemplate(
  campaign: { objective?: string | null, primary_action_type?: string | null },
  templateId: MetaReportTemplateId,
): boolean {
  const id = normalizeMetaTemplateId(templateId)
  if (id === 'overview')
    return true

  const template = getReportTemplate('meta', id)
  const objectives = (template.meta?.objectives || []).map(o => o.toUpperCase())
  const objective = String(campaign.objective || '').toUpperCase()
  if (objective && objectives.length && objectives.includes(objective))
    return true

  const action = String(campaign.primary_action_type || '').toLowerCase()
  const groups = fuzzyGroupsForMetaTemplate(id)
  if (action && groups.some(g => action.includes(g)))
    return true

  // Soft match: keep campaigns without objective/action only for overview (handled above)
  if (!objective && !action)
    return false
  return false
}
