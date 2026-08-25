/**
 * Editable Marketing Reports layout (Meta Ads / Google Ads boards).
 * Persisted per tenant in `marketing_report_layouts.layout` (jsonb).
 */

import type {
  GoogleAdsReportTemplateId,
  MarketingReportPlatform,
  MetaReportTemplateId,
} from '~/types/marketing-reports'

export type MarketingReportLayoutProvider = 'meta' | 'google_ads'

export type ReportLayoutBlockType =
  | 'kpi_primary'
  | 'kpi_detail'
  | 'trend_chart'
  | 'campaigns_table'
  | 'conversions_table'
  | 'networks_table'
  | 'insights'

export interface ReportLayoutBlock {
  /** Stable id within the layout (used as DnD item-key) */
  id: string
  type: ReportLayoutBlockType
  /** When false, block is hidden in the board but kept in the builder */
  enabled?: boolean
  /** Metric keys visible in KPI blocks (from template catalog) */
  metricKeys?: string[]
  title?: string
}

export interface MarketingReportLayoutJson {
  version: 1
  templateBaseId: string
  blocks: ReportLayoutBlock[]
}

export interface MarketingReportLayoutRecord {
  id: string
  tenant_id: string
  provider: MarketingReportLayoutProvider
  template_base_id: string
  layout: MarketingReportLayoutJson
  name: string
  created_at: string
  updated_at: string
}

export type MarketingReportLayoutTemplateId =
  | MetaReportTemplateId
  | GoogleAdsReportTemplateId

export function isMarketingReportLayoutProvider(
  value: string | null | undefined,
): value is MarketingReportLayoutProvider {
  return value === 'meta' || value === 'google_ads'
}

export function platformToLayoutProvider(
  platform: MarketingReportPlatform,
): MarketingReportLayoutProvider | null {
  if (platform === 'meta' || platform === 'google_ads')
    return platform
  return null
}
