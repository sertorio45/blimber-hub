/**
 * Typed report templates and KPI contracts for Marketing reports
 * (Meta Insights, Google Ads API, GA4 Data API).
 */

export type MarketingReportPlatform = 'meta' | 'google_ads' | 'google_analytics'

export type MetaReportTemplateId =
  | 'overview'
  | 'whatsapp'
  | 'ecommerce'
  | 'engagement'
  | 'traffic'
  | 'leads'
  | 'awareness'

export type GoogleAdsReportTemplateId =
  | 'overview'
  | 'search'
  | 'performance_max'
  | 'shopping'
  | 'demand_gen'
  | 'display'
  | 'local'

/** @deprecated Prefer GoogleAdsReportTemplateId */
export type GoogleTemplateType = 'local_business' | 'website_visits' | 'standard'

export type AnalyticsReportTemplateId =
  | 'overview'
  | 'website_visits'
  | 'ecommerce'
  | 'engagement'
  | 'acquisition'

export type ReportMetricFormat =
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'percent'
  | 'roas'

export interface ReportMetricDef {
  key: string
  label: string
  format: ReportMetricFormat
  /** Highlighted in the primary KPI row */
  primary?: boolean
  /** Lower visual weight (cost efficiency metrics) */
  muted?: boolean
  description?: string
}

export interface MetaTemplateFilters {
  /** Fuzzy groups matched against Insights `actions.action_type` */
  resultActionGroups: string[]
  /** Meta ODAX / legacy campaign.objective values */
  objectives?: string[]
}

export interface GoogleAdsTemplateFilters {
  /** campaign.advertising_channel_type values from Google Ads API */
  channelTypes: string[]
}

export interface AnalyticsTemplateFilters {
  /** GA4 Data API metric API names */
  metricNames: string[]
  /** Optional GA4 dimensions for breakdown rows */
  dimensionNames?: string[]
}

export interface ReportTemplateDef {
  id: string
  platform: MarketingReportPlatform
  label: string
  description: string
  metrics: ReportMetricDef[]
  meta?: MetaTemplateFilters
  googleAds?: GoogleAdsTemplateFilters
  analytics?: AnalyticsTemplateFilters
}

export interface GoogleAdsCampaignInsight {
  id: string
  name?: string
  status?: string | null
  channel?: string | null
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  cpc: number
  cost_per_conversion: number | null
}

export interface GoogleAdsSeriesPoint {
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversions_value: number
}

export interface GoogleAdsNetworkRow {
  network: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  cpc: number
  cost_per_conversion: number | null
}

export type GoogleAdsMetrics = {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  cpc: number
  cost_per_conversion: number | null
  roas: number | null
}

/** Percentage change vs previous period; null when not comparable */
export type ReportMetricDeltas = Record<string, number | null>

export interface GoogleAdsOverviewBlock {
  metrics: GoogleAdsMetrics
  /** Aggregated metrics for the previous period of equal length */
  previous_metrics?: GoogleAdsMetrics | null
  /** Delta % vs previous_metrics (keyed like metrics) */
  deltas?: ReportMetricDeltas | null
  campaigns: GoogleAdsCampaignInsight[]
  series?: GoogleAdsSeriesPoint[]
  /** Performance by advertising channel / network type */
  networks?: GoogleAdsNetworkRow[]
  connected: boolean
  customer_id?: string | null
  /** True when OAuth exists but customer_id was not saved */
  needs_account?: boolean
  /** Friendly API / config error for the board (never secrets) */
  error?: string | null
}

export interface AnalyticsSeriesPoint {
  date: string
  sessions: number
  totalUsers: number
  screenPageViews: number
  engagementRate: number
  conversions: number
  purchaseRevenue: number
}

export interface AnalyticsBreakdownRow {
  dimension: string
  sessions: number
  totalUsers: number
  engagementRate?: number
  conversions?: number
  purchaseRevenue?: number
  screenPageViews?: number
}

export interface AnalyticsEventRow {
  name: string
  eventCount: number
  keyEvents: number
}

export type AnalyticsMetrics = {
  sessions: number
  totalUsers: number
  newUsers: number
  screenPageViews: number
  engagedSessions: number
  engagementRate: number
  averageSessionDuration: number
  bounceRate: number
  eventCount: number
  /** Mapped from GA4 `keyEvents` for template/UI compatibility */
  conversions: number
  ecommercePurchases: number
  purchaseRevenue: number
}

export interface AnalyticsOverviewBlock {
  metrics: AnalyticsMetrics
  previous_metrics?: AnalyticsMetrics | null
  deltas?: ReportMetricDeltas | null
  series?: AnalyticsSeriesPoint[]
  /** Acquisition channels (`sessionDefaultChannelGroup`) */
  breakdown?: AnalyticsBreakdownRow[]
  /** Top landing / content pages */
  pages?: AnalyticsBreakdownRow[]
  /** Device category split */
  devices?: AnalyticsBreakdownRow[]
  /** Key / top events */
  events?: AnalyticsEventRow[]
  connected: boolean
  property_id?: string | null
  /** True when OAuth exists but property_id was not saved */
  needs_property?: boolean
  /** Friendly API / config error for the board (never secrets) */
  error?: string | null
}
