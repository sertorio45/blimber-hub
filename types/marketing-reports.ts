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

export interface GoogleAdsOverviewBlock {
  metrics: {
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
  campaigns: GoogleAdsCampaignInsight[]
  series?: GoogleAdsSeriesPoint[]
  connected: boolean
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
}

export interface AnalyticsOverviewBlock {
  metrics: {
    sessions: number
    totalUsers: number
    newUsers: number
    screenPageViews: number
    engagedSessions: number
    engagementRate: number
    averageSessionDuration: number
    bounceRate: number
    eventCount: number
    conversions: number
    ecommercePurchases: number
    purchaseRevenue: number
  }
  series?: AnalyticsSeriesPoint[]
  breakdown?: AnalyticsBreakdownRow[]
  connected: boolean
  property_id?: string | null
}
