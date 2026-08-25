/**
 * Map campaign type hints → predefined report template ids.
 * Used for auto-preset when selecting a base campaign.
 */

import {
  GOOGLE_ADS_REPORT_TEMPLATES,
  META_REPORT_TEMPLATES,
  normalizeGoogleAdsTemplateId,
  normalizeMetaTemplateId,
} from '~/constants/marketing-report-templates'
import type {
  GoogleAdsReportTemplateId,
  MetaReportTemplateId,
} from '~/types/marketing-reports'

/** Google Ads `advertising_channel_type` → template id */
const GOOGLE_CHANNEL_TO_TEMPLATE: Record<string, GoogleAdsReportTemplateId> = {
  SEARCH: 'search',
  PERFORMANCE_MAX: 'performance_max',
  SHOPPING: 'shopping',
  DEMAND_GEN: 'demand_gen',
  DISPLAY: 'display',
  LOCAL: 'local',
  LOCAL_SERVICES: 'local',
  VIDEO: 'overview',
  MULTI_CHANNEL: 'overview',
  UNKNOWN: 'overview',
  UNSPECIFIED: 'overview',
}

/**
 * Resolve Google Ads template from campaign channel type.
 * Falls back to `overview` when unknown / empty.
 */
export function presetGoogleAdsTemplateFromChannel(
  channel: string | null | undefined,
): GoogleAdsReportTemplateId {
  const key = String(channel || '').trim().toUpperCase()
  if (!key)
    return 'overview'
  const mapped = GOOGLE_CHANNEL_TO_TEMPLATE[key]
  if (mapped)
    return mapped
  // Match against template channelTypes lists (future-proof)
  for (const template of GOOGLE_ADS_REPORT_TEMPLATES) {
    const channels = template.googleAds?.channelTypes || []
    if (channels.some(c => c.toUpperCase() === key))
      return normalizeGoogleAdsTemplateId(template.id)
  }
  return 'overview'
}

/**
 * Resolve Meta template from campaign objective (and optional primary action hint).
 * Prefer action hints for ambiguous ODAX objectives (e.g. OUTCOME_ENGAGEMENT),
 * then exact objective match from the more specific templates.
 */
export function presetMetaTemplateFromCampaign(params: {
  objective?: string | null
  primaryActionType?: string | null
}): MetaReportTemplateId {
  const objective = String(params.objective || '').trim().toUpperCase()
  const action = String(params.primaryActionType || '').trim().toLowerCase()

  if (action) {
    if (action.includes('whatsapp') || action.includes('messaging'))
      return 'whatsapp'
    if (action.includes('purchase') || action.includes('omni_purchase'))
      return 'ecommerce'
    if (action.includes('lead') || action.includes('complete_registration') || action.includes('submit_application'))
      return 'leads'
    if (action.includes('landing_page_view') || action.includes('link_click'))
      return 'traffic'
    if (
      action.includes('post_engagement')
      || action.includes('page_engagement')
      || action.includes('video_view')
      || action.includes('like')
      || action.includes('comment')
    ) {
      return 'engagement'
    }
    if (action.includes('reach'))
      return 'awareness'
  }

  // Specific objectives (avoid broad whatsapp list matching first)
  const OBJECTIVE_PRESET: Record<string, MetaReportTemplateId> = {
    OUTCOME_SALES: 'ecommerce',
    PRODUCT_CATALOG_SALES: 'ecommerce',
    OUTCOME_LEADS: 'leads',
    LEAD_GENERATION: 'leads',
    OUTCOME_TRAFFIC: 'traffic',
    LINK_CLICKS: 'traffic',
    TRAFFIC: 'traffic',
    OUTCOME_AWARENESS: 'awareness',
    BRAND_AWARENESS: 'awareness',
    REACH: 'awareness',
    OUTCOME_ENGAGEMENT: 'engagement',
    POST_ENGAGEMENT: 'engagement',
    VIDEO_VIEWS: 'engagement',
    MESSAGES: 'whatsapp',
  }
  if (objective && OBJECTIVE_PRESET[objective])
    return OBJECTIVE_PRESET[objective]

  if (objective) {
    for (const template of META_REPORT_TEMPLATES) {
      if (template.id === 'overview' || template.id === 'whatsapp')
        continue
      const objectives = (template.meta?.objectives || []).map(o => o.toUpperCase())
      if (objectives.includes(objective))
        return normalizeMetaTemplateId(template.id)
    }
  }

  return 'overview'
}
