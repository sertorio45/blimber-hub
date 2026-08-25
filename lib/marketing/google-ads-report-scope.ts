/**
 * Pure helpers to keep Google Ads KPI / series / conversion-action scope
 * aligned when the board filters by campaign.
 */

import type {
  GoogleAdsConversionActionRow,
  GoogleAdsSeriesPoint,
} from '~/types/marketing-reports'

export type GoogleAdsCampaignScopeId = string | 'all'

export interface GoogleAdsConversionActionAggregate {
  id: string | null
  name: string
  conversions: number
  conversions_value: number
  all_conversions: number
  all_conversions_value: number
}

/** Aggregate daily points that share the same date. */
export function aggregateGoogleAdsSeriesByDate(
  points: GoogleAdsSeriesPoint[],
): GoogleAdsSeriesPoint[] {
  const byDate = new Map<string, GoogleAdsSeriesPoint>()
  for (const point of points) {
    const date = String(point.date || '')
    if (!date)
      continue
    const existing = byDate.get(date)
    if (!existing) {
      byDate.set(date, {
        date,
        impressions: Number(point.impressions || 0),
        clicks: Number(point.clicks || 0),
        cost: Number(point.cost || 0),
        conversions: Number(point.conversions || 0),
        conversions_value: Number(point.conversions_value || 0),
      })
      continue
    }
    existing.impressions += Number(point.impressions || 0)
    existing.clicks += Number(point.clicks || 0)
    existing.cost += Number(point.cost || 0)
    existing.conversions += Number(point.conversions || 0)
    existing.conversions_value += Number(point.conversions_value || 0)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Build per-campaign series map and account-level series from campaign-daily rows.
 * Only includes campaign IDs present in `allowedCampaignIds` (template scope).
 */
export function buildGoogleAdsSeriesMaps(
  rows: Array<GoogleAdsSeriesPoint & { campaign_id: string }>,
  allowedCampaignIds: Iterable<string>,
): {
  series: GoogleAdsSeriesPoint[]
  series_by_campaign: Record<string, GoogleAdsSeriesPoint[]>
} {
  const allowed = new Set(
    [...allowedCampaignIds].map(id => String(id)).filter(Boolean),
  )
  const series_by_campaign: Record<string, GoogleAdsSeriesPoint[]> = {}

  for (const row of rows) {
    const campaignId = String(row.campaign_id || '')
    if (!campaignId || !allowed.has(campaignId))
      continue
    const point: GoogleAdsSeriesPoint = {
      date: String(row.date || ''),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      cost: Number(row.cost || 0),
      conversions: Number(row.conversions || 0),
      conversions_value: Number(row.conversions_value || 0),
    }
    if (!point.date)
      continue
    const list = series_by_campaign[campaignId] || []
    list.push(point)
    series_by_campaign[campaignId] = list
  }

  for (const campaignId of Object.keys(series_by_campaign)) {
    series_by_campaign[campaignId] = aggregateGoogleAdsSeriesByDate(
      series_by_campaign[campaignId],
    )
  }

  const series = aggregateGoogleAdsSeriesByDate(
    Object.values(series_by_campaign).flat(),
  )

  return { series, series_by_campaign }
}

/** Pick account series or a single campaign series for the board scope. */
export function pickGoogleAdsSeriesForScope(params: {
  series?: GoogleAdsSeriesPoint[] | null
  seriesByCampaign?: Record<string, GoogleAdsSeriesPoint[]> | null
  campaignId: GoogleAdsCampaignScopeId
}): GoogleAdsSeriesPoint[] {
  const campaignId = params.campaignId
  if (campaignId !== 'all') {
    const byCampaign = params.seriesByCampaign?.[String(campaignId)]
    return Array.isArray(byCampaign) ? byCampaign : []
  }
  return Array.isArray(params.series) ? params.series : []
}

export function parseGoogleAdsConversionActionId(
  resourceName: string | null | undefined,
): string | null {
  const raw = String(resourceName || '').trim()
  if (!raw)
    return null
  const match = raw.match(/conversionActions\/(\d+)/i)
  if (match?.[1])
    return match[1]
  if (/^\d+$/.test(raw))
    return raw
  return raw
}

/** Aggregate conversion-action rows for the selected campaign scope. */
export function pickGoogleAdsConversionActionsForScope(params: {
  actions?: GoogleAdsConversionActionRow[] | null
  campaignId: GoogleAdsCampaignScopeId
  /** When scope is `all`, only include these campaign ids (template filter). */
  allowedCampaignIds?: Iterable<string> | null
}): GoogleAdsConversionActionAggregate[] {
  const actions = Array.isArray(params.actions) ? params.actions : []
  const allowed = params.allowedCampaignIds
    ? new Set([...params.allowedCampaignIds].map(id => String(id)).filter(Boolean))
    : null

  const scoped = actions.filter((row) => {
    const campaignId = row.campaign_id != null ? String(row.campaign_id) : ''
    if (params.campaignId !== 'all')
      return campaignId === String(params.campaignId)
    if (!campaignId)
      return true
    if (allowed)
      return allowed.has(campaignId)
    return true
  })

  const byKey = new Map<string, GoogleAdsConversionActionAggregate>()
  for (const row of scoped) {
    const id = row.id != null ? String(row.id) : null
    const name = String(row.name || '').trim() || 'Ação sem nome'
    const key = id || name.toLowerCase()
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        id,
        name,
        conversions: Number(row.conversions || 0),
        conversions_value: Number(row.conversions_value || 0),
        all_conversions: Number(row.all_conversions || 0),
        all_conversions_value: Number(row.all_conversions_value || 0),
      })
      continue
    }
    existing.conversions += Number(row.conversions || 0)
    existing.conversions_value += Number(row.conversions_value || 0)
    existing.all_conversions += Number(row.all_conversions || 0)
    existing.all_conversions_value += Number(row.all_conversions_value || 0)
    if (!existing.name && name)
      existing.name = name
  }

  return [...byKey.values()].sort((a, b) => {
    const aScore = Math.max(a.conversions, a.all_conversions)
    const bScore = Math.max(b.conversions, b.all_conversions)
    if (bScore !== aScore)
      return bScore - aScore
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

export function googleAdsConversionEmptyMessage(params: {
  campaignId: GoogleAdsCampaignScopeId
  configuredCount: number
  conversionsTotal: number
  allConversionsTotal?: number
}): string {
  const configured = Number(params.configuredCount || 0)
  const conversions = Number(params.conversionsTotal || 0)
  const allConversions = Number(params.allConversionsTotal ?? conversions)

  if (configured <= 0) {
    return params.campaignId === 'all'
      ? 'Nenhuma ação de conversão configurada na conta'
      : 'Campanha sem ações de conversão configuradas'
  }

  if (conversions <= 0 && allConversions <= 0)
    return 'Nenhuma conversão no período'

  return 'Nenhuma conversão no período'
}

/**
 * Default for the “Incluir todas as conversões” toggle.
 * Performance Max campaigns (and the PMax report template) prefer
 * `all_conversions` because primary conversions often undercount.
 */
export function defaultShowAllConversions(params: {
  templateId?: string | null
  campaignChannel?: string | null
}): boolean {
  const templateId = String(params.templateId || '').trim().toLowerCase()
  if (templateId === 'performance_max')
    return true
  const channel = String(params.campaignChannel || '').trim().toUpperCase()
  return channel === 'PERFORMANCE_MAX'
}
