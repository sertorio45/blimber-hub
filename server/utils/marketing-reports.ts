import {
  getReportTemplate,
  normalizeAnalyticsTemplateId,
  normalizeGoogleAdsTemplateId,
  normalizeMetaTemplateId,
} from '~/constants/marketing-report-templates'
import {
  // Alias avoids Nitro dual auto-import of the same symbol from google-ads + this file.
  getGoogleAccessToken as getGoogleOAuthAccessToken,
  googleAdsApiUrl,
  googleAdsSearchHeaders,
  normalizeGoogleCustomerId,
  resolveGoogleAdsDeveloperToken,
  resolveGoogleAdsLoginCustomerId,
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

function emptyGoogleBlock(connected: boolean): GoogleAdsOverviewBlock {
  return {
    connected,
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
    campaigns: [],
    series: [],
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

export async function fetchGoogleAdsReportData(
  config: Record<string, any>,
  dateOpts: { datePreset: string, dateStart: string, dateEnd: string },
  templateRaw?: string | null,
): Promise<GoogleAdsOverviewBlock> {
  const templateId = normalizeGoogleAdsTemplateId(templateRaw)
  const customerId = normalizeGoogleCustomerId(config.customer_id)
  const developerToken = resolveGoogleAdsDeveloperToken(config)
  const loginCustomerId = resolveGoogleAdsLoginCustomerId(config)
  const accessToken = await getGoogleOAuthAccessToken(config)
  const hasOauth = Boolean(
    decryptSecret(config.access_token_enc) || decryptSecret(config.refresh_token_enc),
  )

  if (!customerId || !developerToken || !accessToken)
    return emptyGoogleBlock(hasOauth)

  const headers = googleAdsSearchHeaders(accessToken, developerToken, loginCustomerId)

  const dateWhere = buildGoogleDateWhere(dateOpts.datePreset, dateOpts.dateStart, dateOpts.dateEnd)

  const campaignQuery = `
    SELECT
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
    FROM campaign
    WHERE ${dateWhere}
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

  const [campaignResponse, dailyResponse] = await Promise.all([
    $fetch<any[]>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:searchStream`),
      { method: 'POST', headers, body: { query: campaignQuery } },
    ).catch(() => []),
    $fetch<any[]>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:searchStream`),
      { method: 'POST', headers, body: { query: dailyQuery } },
    ).catch(() => []),
  ])

  const campaignRows = Array.isArray(campaignResponse)
    ? campaignResponse.flatMap(chunk => chunk.results || [])
    : []
  const allCampaigns = campaignRows.map(mapGoogleCampaignRow)
  const campaigns = filterGoogleByTemplate(allCampaigns, templateId)

  const dailyRows = Array.isArray(dailyResponse)
    ? dailyResponse.flatMap(chunk => chunk.results || [])
    : []
  const series = dailyRows
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
    metrics: aggregateGoogleCampaigns(campaigns),
    campaigns,
    series,
  }
}

function emptyAnalyticsBlock(connected: boolean, propertyId?: string | null): AnalyticsOverviewBlock {
  return {
    connected,
    property_id: propertyId || null,
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
    series: [],
    breakdown: [],
  }
}

function metricMapFromGa4Row(metricHeaders: any[], values: any[]) {
  const map: Record<string, number> = {}
  for (let i = 0; i < metricHeaders.length; i++) {
    const name = String(metricHeaders[i]?.name || '')
    map[name] = Number(values[i]?.value || 0)
  }
  return map
}

function normalizeEngagementRate(raw: number) {
  // GA4 returns engagementRate as a fraction (0–1)
  if (raw >= 0 && raw <= 1)
    return raw * 100
  return raw
}

export async function fetchAnalyticsReportData(
  config: Record<string, any>,
  dateOpts: { datePreset: string, dateStart: string, dateEnd: string },
  templateRaw?: string | null,
): Promise<AnalyticsOverviewBlock> {
  const templateId = normalizeAnalyticsTemplateId(templateRaw) as AnalyticsReportTemplateId
  const template = getReportTemplate('google_analytics', templateId)
  const propertyId = String(config.property_id || config.analytics_account_id || '').replace(/^properties\//, '')
  const accessToken = await getGoogleOAuthAccessToken(config)

  if (!propertyId || !accessToken)
    return emptyAnalyticsBlock(false, propertyId || null)

  const dateRange = buildGa4DateRange(dateOpts.datePreset, dateOpts.dateStart, dateOpts.dateEnd)
  const metricNames = template.analytics?.metricNames?.length
    ? template.analytics.metricNames
    : [
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
      ]

  const overviewMetrics = [
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
  ]
  // Always request full overview set so UI can switch templates without refetch gaps
  const uniqueMetrics = [...new Set([...overviewMetrics, ...metricNames])]

  const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`

  const [totalsRes, seriesRes, breakdownRes] = await Promise.all([
    $fetch<any>(`${baseUrl}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        dateRanges: [dateRange],
        metrics: uniqueMetrics.map(name => ({ name })),
        metricAggregations: ['TOTAL'],
      },
    }).catch(() => null),
    $fetch<any>(`${baseUrl}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 90,
      },
    }).catch(() => null),
    template.analytics?.dimensionNames?.length
      ? $fetch<any>(`${baseUrl}:runReport`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            dateRanges: [dateRange],
            dimensions: template.analytics.dimensionNames.map(name => ({ name })),
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'engagementRate' },
              { name: 'conversions' },
              { name: 'purchaseRevenue' },
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 12,
          },
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  const headers = totalsRes?.metricHeaders || []
  const totalsRow
    = (totalsRes?.totals && totalsRes.totals[0]?.metricValues)
      || (totalsRes?.rows && totalsRes.rows[0]?.metricValues)
      || []
  const m = metricMapFromGa4Row(headers, totalsRow)

  const series = (seriesRes?.rows || []).map((row: any) => {
    const dim = String(row.dimensionValues?.[0]?.value || '')
    const date
      = dim.length === 8
        ? `${dim.slice(0, 4)}-${dim.slice(4, 6)}-${dim.slice(6, 8)}`
        : dim
    const mm = metricMapFromGa4Row(seriesRes?.metricHeaders || [], row.metricValues || [])
    return {
      date,
      sessions: mm.sessions || 0,
      totalUsers: mm.totalUsers || 0,
      screenPageViews: mm.screenPageViews || 0,
      engagementRate: normalizeEngagementRate(mm.engagementRate || 0),
      conversions: mm.conversions || 0,
      purchaseRevenue: mm.purchaseRevenue || 0,
    }
  })

  const breakdown = (breakdownRes?.rows || []).map((row: any) => {
    const mm = metricMapFromGa4Row(breakdownRes?.metricHeaders || [], row.metricValues || [])
    return {
      dimension: String(row.dimensionValues?.[0]?.value || '(não definido)'),
      sessions: mm.sessions || 0,
      totalUsers: mm.totalUsers || 0,
      engagementRate: normalizeEngagementRate(mm.engagementRate || 0),
      conversions: mm.conversions || 0,
      purchaseRevenue: mm.purchaseRevenue || 0,
    }
  })

  return {
    connected: true,
    property_id: propertyId,
    metrics: {
      sessions: m.sessions || 0,
      totalUsers: m.totalUsers || 0,
      newUsers: m.newUsers || 0,
      screenPageViews: m.screenPageViews || 0,
      engagedSessions: m.engagedSessions || 0,
      engagementRate: normalizeEngagementRate(m.engagementRate || 0),
      averageSessionDuration: m.averageSessionDuration || 0,
      bounceRate: normalizeEngagementRate(m.bounceRate || 0),
      eventCount: m.eventCount || 0,
      conversions: m.conversions || 0,
      ecommercePurchases: m.ecommercePurchases || 0,
      purchaseRevenue: m.purchaseRevenue || 0,
    },
    series,
    breakdown,
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
