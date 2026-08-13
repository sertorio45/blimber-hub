import type { ReportMetricDef, ReportMetricDeltas, ReportMetricFormat } from '~/types/marketing-reports'
import type { SocialPlatform } from '~/types/marketing-social'

/** Meta Insights API standard aggregation windows */
export type MetaOrganicPeriod = 'day' | 'week' | 'days_28'

export type OrganicReportPlatform = SocialPlatform

export interface OrganicReportDateRange {
  preset: string
  date_start: string | null
  date_end: string | null
  meta_period: MetaOrganicPeriod
}

export interface MetaOrganicSeriesPoint {
  date: string
  [metricKey: string]: string | number
}

export interface MetaOrganicMetrics {
  [metricKey: string]: number
}

export interface MetaOrganicAccountInfo {
  id: string
  external_account_id: string
  name: string
  username?: string | null
  avatar_url?: string | null
}

export interface MetaOrganicReportBlock {
  platform: 'facebook' | 'instagram'
  account: MetaOrganicAccountInfo
  connected: boolean
  metrics: MetaOrganicMetrics
  previous_metrics?: MetaOrganicMetrics | null
  deltas?: ReportMetricDeltas | null
  series: MetaOrganicSeriesPoint[]
  meta_period: MetaOrganicPeriod
  error?: string | null
}

export interface OrganicReportsPayload {
  platforms: OrganicReportPlatform[]
  accounts: Array<{
    id: string
    platform: OrganicReportPlatform
    name: string
    username?: string | null
    avatar_url?: string | null
    external_account_id: string
  }>
  period: OrganicReportDateRange
  facebook?: MetaOrganicReportBlock | null
  instagram?: MetaOrganicReportBlock | null
  linkedin?: {
    connected: boolean
    account?: MetaOrganicAccountInfo | null
    message?: string
  } | null
}

export interface OrganicMetricDef extends ReportMetricDef {
  /** When true, totals use the latest bucket value instead of summing the series */
  snapshot?: boolean
  format: ReportMetricFormat
}
