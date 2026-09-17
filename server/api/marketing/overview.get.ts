import { serverSupabaseServiceRole } from '#supabase/server'

import { createError, defineEventHandler, getQuery } from 'h3'

import {
  normalizeAnalyticsTemplateId,
  normalizeGoogleAdsTemplateId,
  normalizeMetaTemplateId,
} from '~/constants/marketing-report-templates'
import {
  buildMarketingOverviewCacheKey,
  decryptSecret,
  getCachedMarketingData,
  resolveMarketingTenantContext,
  setCachedMarketingData,
} from '~/server/utils/marketing'
import {
  campaignMatchesMetaTemplate,
  fetchAnalyticsReportData,
  fetchGoogleAdsReportData,
} from '~/server/utils/marketing-reports'
import {
  buildMetaInsightsDateQuery,
  emptyMetaMetrics,
  mapCampaignInsightRow,
  mapDailyInsightRow,
  overlayAccountMetricsWithDailySum,
  parseCostPerActionType,
  parseMetaActionsResults,
  parsePurchaseRoas,
  pickPrimaryResultActionType,
  pickPrimaryResultActionTypeFromRows,
  reaggregateMetaMetrics,
  resolveMetaInsightsWindow,
} from '~/server/utils/marketing-meta-insights'
import { resolveMetaGraphVersion } from '~/lib/meta-ads/graph'
import type { MetaReportTemplateId } from '~/types/marketing-reports'

const MARKETING_OVERVIEW_CALC_VERSION = 'calc_v8'

/** Graph API sometimes returns nested objects as JSON strings */
function parseMaybeObject(v: unknown): Record<string, unknown> | null {
  if (v == null)
    return null
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v) as unknown
      return typeof o === 'object' && o != null ? (o as Record<string, unknown>) : null
    }
    catch {
      return null
    }
  }
  if (typeof v === 'object')
    return v as Record<string, unknown>
  return null
}

/** Prefer large preview URLs from object_story_spec (ex.: link ads picture) */
function bestUrlFromObjectStorySpec(oss: Record<string, unknown> | null): string | null {
  if (!oss)
    return null
  const ld = oss.link_data as Record<string, unknown> | undefined
  if (ld) {
    const pic = ld.picture
    if (typeof pic === 'string' && pic.startsWith('http'))
      return pic
    const children = ld.child_attachments
    if (Array.isArray(children)) {
      for (const ch of children) {
        const p = (ch as Record<string, unknown>)?.picture
        if (typeof p === 'string' && p.startsWith('http'))
          return p
      }
    }
  }
  const vd = oss.video_data as Record<string, unknown> | undefined
  if (vd) {
    const iu = vd.image_url
    if (typeof iu === 'string' && iu.startsWith('http'))
      return iu
  }
  const pd = oss.photo_data as Record<string, unknown> | undefined
  if (pd) {
    const u = pd.url
    if (typeof u === 'string' && u.startsWith('http'))
      return u
  }
  return null
}

/**
 * Resolve best display URL for a creative: ad library (hash) → object_story_spec → image_url → thumbnail.
 */
function resolveCreativePreviewImageUrl(
  creative: Record<string, unknown> | null | undefined,
  hashToUrl: Map<string, string>,
): string | null {
  if (!creative || typeof creative !== 'object')
    return null
  const hash = creative.image_hash != null ? String(creative.image_hash) : ''
  if (hash && hashToUrl.has(hash))
    return hashToUrl.get(hash) || null
  const oss = parseMaybeObject(creative.object_story_spec)
  const fromOss = bestUrlFromObjectStorySpec(oss)
  if (fromOss)
    return fromOss
  const iu = creative.image_url
  if (typeof iu === 'string' && iu.startsWith('http'))
    return iu
  const tu = creative.thumbnail_url
  if (typeof tu === 'string' && tu.startsWith('http'))
    return tu
  return null
}

/** Batch-fetch full-size / permalink URLs from Ad Library via image hashes */
async function fetchAdImageUrlsByHashes(
  accessToken: string,
  adAccountId: string,
  apiVersion: string,
  hashes: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(hashes.filter(Boolean))]
  if (!unique.length)
    return map
  const base = `https://graph.facebook.com/${apiVersion}/act_${adAccountId}/adimages`
  const chunkSize = 50
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    try {
      const res = await $fetch<any>(base, {
        query: {
          hashes: JSON.stringify(chunk),
          fields: 'hash,url,permalink_url,original_width,original_height,width,height',
          access_token: accessToken,
        },
      })
      for (const row of res?.data || []) {
        const h = row?.hash != null ? String(row.hash) : ''
        const best = row?.permalink_url || row?.url
        if (h && typeof best === 'string' && best.startsWith('http'))
          map.set(h, best)
      }
    }
    catch {
      // Chunk may fail if hashes invalid; continue with fallbacks per ad
    }
  }
  return map
}

async function fetchMetaData(
  config: Record<string, any>,
  opts: {
    datePreset: string
    dateStart: string
    dateEnd: string
    adsActiveOnly: boolean
    insightsOnly: boolean
    templateId: MetaReportTemplateId
  },
): Promise<{
  metrics: ReturnType<typeof emptyMetaMetrics>
  campaigns: Record<string, any>[]
  ads: any[]
  series: any[]
  template: MetaReportTemplateId
  connected: boolean
}> {
  const accessToken = decryptSecret(config.access_token_enc)
  const adAccountId = config.ad_account_id

  if (!accessToken || !adAccountId) {
    return {
      metrics: emptyMetaMetrics(),
      campaigns: [] as any[],
      ads: [] as any[],
      series: [] as any[],
      template: opts.templateId,
      connected: false,
    }
  }

  const apiVersion = resolveMetaGraphVersion(config.api_version)
  const base = `https://graph.facebook.com/${apiVersion}/act_${adAccountId}`
  const insightFields
    = 'campaign_id,campaign_name,impressions,clicks,spend,cpc,reach,ctr,cpm,actions,cost_per_action_type,action_values,purchase_roas'
  const accountFields
    = 'impressions,clicks,spend,cpc,reach,ctr,cpm,actions,cost_per_action_type,action_values,purchase_roas'

  const dateWindow = resolveMetaInsightsWindow(opts.datePreset, opts.dateStart, opts.dateEnd)
  const dateQ = buildMetaInsightsDateQuery(dateWindow)

  const adsQuery: Record<string, string> = {
    fields:
      'id,name,campaign{id,name},effective_status,creative{image_url,thumbnail_url,image_hash,object_story_spec}',
    limit: '100',
    access_token: accessToken,
  }
  if (opts.adsActiveOnly) {
    adsQuery.filtering = JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ])
  }

  const dailyInsightFields
    = 'impressions,clicks,spend,reach,cpc,ctr,cpm,actions,cost_per_action_type,purchase_roas'

  const [accountRes, campaignRes, dailyRes, campMetaRes]: [
    any,
    any,
    any,
    any,
  ] = await Promise.all([
    $fetch<any>(`${base}/insights`, {
      query: {
        fields: accountFields,
        access_token: accessToken,
        ...dateQ,
      },
    }).catch(() => ({ data: [] })),
    $fetch<any>(`${base}/insights`, {
      query: {
        level: 'campaign',
        fields: insightFields,
        access_token: accessToken,
        ...dateQ,
      },
    }).catch(() => ({ data: [] })),
    $fetch<any>(`${base}/insights`, {
      query: {
        fields: dailyInsightFields,
        time_increment: '1',
        access_token: accessToken,
        ...dateQ,
        limit: '90',
      },
    }).catch(() => ({ data: [] })),
    // Always load objective/status for template filtering + labels
    $fetch<any>(`${base}/campaigns`, {
      query: {
        fields: 'id,name,status,objective,effective_status',
        limit: 200,
        access_token: accessToken,
      },
    }).catch(() => ({ data: [] })),
  ])

  const statusById = new Map<string, string>()
  const objectiveById = new Map<string, string>()
  for (const c of (campMetaRes?.data || [])) {
    statusById.set(String(c.id), String(c.status || c.effective_status || ''))
    if (c.objective)
      objectiveById.set(String(c.id), String(c.objective))
  }

  const accountRow = (accountRes?.data || [])[0] || {}
  const templateId = opts.templateId
  const dailyRows = dailyRes?.data || []

  /**
   * Pick the result action from the daily breakdown first so the KPI sums the same
   * metric the chart shows. Account/campaign totals often include unique `_7d` /
   * `lead_grouped` keys that do not exist (or do not add) day-by-day.
   */
  const primaryResultActionTypeForAccount
    = pickPrimaryResultActionTypeFromRows(dailyRows, templateId)
      || pickPrimaryResultActionTypeFromRows(campaignRes?.data || [], templateId)
      || pickPrimaryResultActionType(accountRow.actions, templateId)
      || null

  /** Each campaign row uses template-aware action picking */
  const allCampaigns: Record<string, any>[] = (campaignRes?.data || []).map((item: any) => {
    const perCampaignAction
      = pickPrimaryResultActionType(item.actions, templateId)
        || pickPrimaryResultActionTypeFromRows([item], templateId)
    const row = mapCampaignInsightRow(item, perCampaignAction) as Record<string, any>
    row.status = statusById.get(String(row.id)) || null
    row.objective = objectiveById.get(String(row.id)) || null
    row.primary_action_type = perCampaignAction
    return row
  })

  const campaigns: Record<string, any>[]
    = templateId === 'overview'
      ? allCampaigns
      : allCampaigns.filter((c: Record<string, any>) =>
          campaignMatchesMetaTemplate(
            { objective: c.objective, primary_action_type: c.primary_action_type },
            templateId,
          ),
        )

  // Soft fallback: if template filter emptied the list, keep all with template action metrics
  const effectiveCampaigns: Record<string, any>[] = campaigns.length ? campaigns : allCampaigns

  const series = dailyRows.map((row: Record<string, unknown>) =>
    mapDailyInsightRow(row, primaryResultActionTypeForAccount),
  )

  const accountMetrics = (() => {
    const impressions = Number(accountRow.impressions || 0)
    const clicks = Number(accountRow.clicks || 0)
    const spend = Number(accountRow.spend || 0)
    const reach = Number(accountRow.reach || 0)
    const ctr = Number(accountRow.ctr ?? (impressions > 0 ? (clicks / impressions) * 100 : 0))
    const cpc = Number(accountRow.cpc || 0) || (clicks > 0 ? spend / clicks : 0)
    const cpm = Number(accountRow.cpm || 0) || (impressions > 0 ? (spend / impressions) * 1000 : 0)
    const results = parseMetaActionsResults(accountRow.actions, primaryResultActionTypeForAccount)
    const roas = parsePurchaseRoas(accountRow.purchase_roas)
    const costPerResult
      = parseCostPerActionType(accountRow.cost_per_action_type, primaryResultActionTypeForAccount)
        || (results > 0 ? spend / results : 0)
    return {
      impressions,
      clicks,
      spend,
      reach,
      ctr,
      cpc,
      cpm,
      results,
      roas,
      cost_per_result: costPerResult,
    }
  })()

  const metrics
    = templateId === 'overview' || !campaigns.length
      ? overlayAccountMetricsWithDailySum(accountMetrics, series)
      : reaggregateMetaMetrics(effectiveCampaigns)

  let ads: any[] = []
  if (!opts.insightsOnly) {
    const [adsResponse, adLevelInsights] = await Promise.all([
      $fetch<any>(`${base}/ads`, {
        query: adsQuery,
      }).catch(() => ({ data: [] })),
      $fetch<any>(`${base}/insights`, {
        query: {
          level: 'ad',
          fields: 'ad_id,impressions,clicks,spend,ctr,cpc,cpm',
          access_token: accessToken,
          ...dateQ,
          limit: '200',
        },
      }).catch(() => ({ data: [] })),
    ])

    const adMetricsById = new Map<string, {
      impressions: number
      clicks: number
      spend: number
      ctr: number
      cpc: number
      cpm: number
    }>()
    for (const row of adLevelInsights?.data || []) {
      const aid = row?.ad_id != null ? String(row.ad_id) : ''
      if (!aid)
        continue
      adMetricsById.set(aid, {
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        spend: Number(row.spend || 0),
        ctr: Number(row.ctr ?? 0),
        cpc: Number(row.cpc || 0),
        cpm: Number(row.cpm || 0),
      })
    }

    const rawAds = adsResponse?.data || []
    const creativeHashes = rawAds
      .map((ad: any) => ad.creative?.image_hash)
      .filter((h: unknown) => h != null && String(h).length > 0)
      .map((h: unknown) => String(h))
    const hashToUrl = await fetchAdImageUrlsByHashes(accessToken, adAccountId, apiVersion, creativeHashes)

    const allowedCampaignIds = new Set(effectiveCampaigns.map((c: Record<string, any>) => String(c.id)))
    ads = rawAds
      .filter((ad: any) => {
        if (templateId === 'overview')
          return true
        const cid = ad.campaign?.id != null ? String(ad.campaign.id) : ''
        return !cid || allowedCampaignIds.has(cid)
      })
      .map((ad: any) => {
        const m = adMetricsById.get(String(ad.id))
        const creative = ad.creative as Record<string, unknown> | undefined
        const image_url = resolveCreativePreviewImageUrl(creative, hashToUrl)
        return {
          id: ad.id,
          name: ad.name,
          campaign_id: ad.campaign?.id ? String(ad.campaign.id) : null,
          campaign_name: ad.campaign?.name || null,
          effective_status: ad.effective_status ? String(ad.effective_status) : null,
          image_url,
          impressions: m?.impressions ?? null,
          clicks: m?.clicks ?? null,
          spend: m?.spend ?? null,
          ctr: m?.ctr ?? null,
          cpc: m?.cpc ?? null,
          cpm: m?.cpm ?? null,
        }
      })
  }

  return {
    campaigns: effectiveCampaigns,
    metrics,
    ads,
    series,
    template: templateId,
    connected: true,
  }
}

function parseDatePresetQuery(query: Record<string, unknown>) {
  let datePreset = String(query.date_preset || 'today')
  const dateStart = String(query.date_start || '').trim()
  const dateEnd = String(query.date_end || '').trim()
  const iso = /^\d{4}-\d{2}-\d{2}$/

  if (datePreset === 'custom') {
    if (!iso.test(dateStart) || !iso.test(dateEnd) || dateStart > dateEnd)
      datePreset = 'today'
  }
  else if (
    ![
      'last_7d',
      'last_14d',
      'last_30d',
      'last_90d',
      'all',
      'custom',
      'today',
      'yesterday',
    ].includes(datePreset)
  ) {
    datePreset = 'today'
  }

  const metaActiveOnlyRaw = query.meta_active_only ?? query.meta_ads_active_only
  const metaAdsActiveOnly
    = metaActiveOnlyRaw === 'true' || metaActiveOnlyRaw === '1'

  const dateWindow = resolveMetaInsightsWindow(
    datePreset,
    datePreset === 'custom' ? dateStart : '',
    datePreset === 'custom' ? dateEnd : '',
  )
  const periodKey = `${dateWindow.preset}:${dateWindow.since}:${dateWindow.until}`

  return {
    datePreset,
    dateStart: datePreset === 'custom' ? dateStart : '',
    dateEnd: datePreset === 'custom' ? dateEnd : '',
    metaAdsActiveOnly,
    periodKey,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = (query.source as string) || 'all'
  const googleTemplate = normalizeGoogleAdsTemplateId(
    String(query.google_template || query.report_template || 'overview'),
  )
  const metaTemplate = normalizeMetaTemplateId(
    String(query.meta_template || (source === 'meta' ? query.report_template : '') || 'overview'),
  )
  const analyticsTemplate = normalizeAnalyticsTemplateId(
    String(query.analytics_template || (source === 'google_analytics' ? query.report_template : '') || 'overview'),
  )
  const forceRefresh = query.force_refresh === 'true'
  const insightsOnly = query.insights_only !== 'false'

  const {
    datePreset,
    dateStart,
    dateEnd,
    metaAdsActiveOnly,
    periodKey,
  } = parseDatePresetQuery(query as Record<string, unknown>)

  const { tenantId } = await resolveMarketingTenantContext(event, query.tenant_id as string | undefined)
  const client = await serverSupabaseServiceRole(event)

  const { data: integrations, error } = await client
    .from('marketing_integrations')
    .select('provider, config, is_active, updated_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const cacheKey = buildMarketingOverviewCacheKey(
    source,
    googleTemplate,
    `${periodKey}:${insightsOnly ? 'ins1' : 'ins0'}:${MARKETING_OVERVIEW_CALC_VERSION}`,
    metaAdsActiveOnly,
    integrations || [],
    { meta: metaTemplate, analytics: analyticsTemplate },
  )

  if (!forceRefresh) {
    const cached = await getCachedMarketingData(client, tenantId, source as any, cacheKey)
    if (cached) {
      return { data: cached, cached: true }
    }
  }

  const googleConfig
    = integrations?.find((row: any) => row.provider === 'google_ads')?.config
      || integrations?.find((row: any) => row.provider === 'google')?.config
      || null
  const metaConfig = integrations?.find((row: any) => row.provider === 'meta')?.config || null
  const analyticsConfig
    = integrations?.find((row: any) => row.provider === 'google_analytics')?.config || null

  const shouldLoadGoogle = source === 'all' || source === 'google_ads'
  const shouldLoadMeta = source === 'all' || source === 'meta'
  const shouldLoadAnalytics = source === 'all' || source === 'google_analytics'

  const dateOpts = { datePreset, dateStart, dateEnd }

  const [googleData, metaData, analyticsData] = await Promise.all([
    shouldLoadGoogle && googleConfig
      ? fetchGoogleAdsReportData(googleConfig, dateOpts, googleTemplate)
      : Promise.resolve(null),
    shouldLoadMeta && metaConfig
      ? fetchMetaData(metaConfig, {
          ...dateOpts,
          adsActiveOnly: metaAdsActiveOnly,
          insightsOnly,
          templateId: metaTemplate,
        })
      : Promise.resolve(null),
    shouldLoadAnalytics && analyticsConfig
      ? fetchAnalyticsReportData(analyticsConfig, dateOpts, analyticsTemplate)
      : Promise.resolve(null),
  ])

  const payload = {
    source,
    google_template: googleTemplate,
    meta_template: metaTemplate,
    analytics_template: analyticsTemplate,
    period: {
      preset: datePreset,
      date_start: datePreset === 'custom' ? dateStart : null,
      date_end: datePreset === 'custom' ? dateEnd : null,
      meta_active_only: metaAdsActiveOnly,
    },
    google: googleData || {
      connected: Boolean(googleConfig),
      customer_id: googleConfig?.customer_id || null,
      needs_account: Boolean(googleConfig && !googleConfig.customer_id),
      error: null,
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
    },
    analytics: analyticsData || {
      connected: Boolean(analyticsConfig),
      property_id: analyticsConfig?.property_id || analyticsConfig?.analytics_account_id || null,
      needs_property: Boolean(
        analyticsConfig
        && !(analyticsConfig.property_id || analyticsConfig.analytics_account_id),
      ),
      error: null,
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
    },
    meta: {
      metrics: metaData?.metrics || emptyMetaMetrics(),
      campaigns: metaData?.campaigns || [],
      ads: metaData?.ads || [],
      series: metaData?.series || [],
      template: metaTemplate,
      connected: metaData?.connected ?? Boolean(metaConfig),
    },
  }

  // Avoid caching fatal Google/Analytics API errors as "empty success" zeros.
  const hasReportApiError = Boolean(payload.google?.error || payload.analytics?.error)
  if (!hasReportApiError)
    await setCachedMarketingData(client, tenantId, source as any, cacheKey, payload, 30)

  return { data: payload, cached: false }
})
