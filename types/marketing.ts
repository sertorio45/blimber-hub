import type {
  AnalyticsOverviewBlock,
  AnalyticsReportTemplateId,
  GoogleAdsOverviewBlock,
  GoogleAdsReportTemplateId,
  GoogleTemplateType,
  MetaReportTemplateId,
} from '~/types/marketing-reports'

export type MarketingProvider = 'google_ads' | 'google_analytics' | 'meta' | 'linkedin'

export type { GoogleTemplateType, GoogleAdsReportTemplateId, MetaReportTemplateId, AnalyticsReportTemplateId }

export interface MarketingIntegrationPayload {
  provider: MarketingProvider
  tenant_id?: string
  is_active?: boolean
  config: Record<string, unknown>
}

export type MarketingDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'custom'

export interface MarketingOverviewQuery {
  tenant_id?: string
  source?: 'all' | 'google_ads' | 'google_analytics' | 'meta'
  /** @deprecated Prefer google_template with GoogleAdsReportTemplateId */
  google_template?: GoogleTemplateType | GoogleAdsReportTemplateId
  meta_template?: MetaReportTemplateId
  analytics_template?: AnalyticsReportTemplateId
  report_template?: string
  force_refresh?: boolean
  insights_only?: string | boolean
  date_preset?: MarketingDatePreset | string
  date_start?: string
  date_end?: string
  /** Prefer `meta_active_only`; `meta_ads_active_only` is accepted for compatibility */
  meta_active_only?: string | boolean
  meta_ads_active_only?: string | boolean
}

export interface MetaCampaignInsight {
  id: string
  name?: string
  status?: string | null
  objective?: string | null
  primary_action_type?: string | null
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

export interface MetaAdCreative {
  id: string
  name?: string
  campaign_id?: string | null
  campaign_name?: string | null
  effective_status?: string | null
  image_url?: string | null
  impressions?: number | null
  clicks?: number | null
  spend?: number | null
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
}

/** Daily (or per bucket) points for Meta account-level sparklines */
export interface MetaSeriesPoint {
  date: string
  impressions: number
  clicks: number
  spend: number
  reach: number
  ctr: number
  cpc: number
  cpm: number
  results: number
  cost_per_result: number
  roas: number | null
}

export interface MarketingOverviewPeriod {
  preset: string
  date_start: string | null
  date_end: string | null
  meta_active_only: boolean
}

export interface MetaOverviewBlock {
  metrics: {
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
  campaigns: MetaCampaignInsight[]
  ads: MetaAdCreative[]
  /** Account-level time series (Meta `time_increment=1`) */
  series?: MetaSeriesPoint[]
  template?: MetaReportTemplateId | string
  connected?: boolean
}

export type { GoogleAdsOverviewBlock, AnalyticsOverviewBlock }
