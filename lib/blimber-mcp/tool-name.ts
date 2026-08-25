/**
 * Resolve ChatGPT / registry aliases to the canonical MCP tool name.
 *
 * ChatGPT Developer Mode namespaces tools as `Blimber_Hub.<tool>` (and may
 * send that string on tools/call). Also accepts ads_meta_* registry aliases
 * and OpenAPI operationIds (createAd → meta_create_ad).
 */

import { fromAdsMetaToolName } from './ads/meta'

const OPENAPI_TO_META: Record<string, string> = {
  listIntegrations: 'meta_list_integrations',
  listAdAccounts: 'meta_list_ad_accounts',
  listCampaigns: 'meta_list_campaigns',
  getCampaign: 'meta_get_campaign',
  listAdsets: 'meta_list_adsets',
  listAds: 'meta_list_ads',
  getInsights: 'meta_get_insights',
  searchInterests: 'meta_search_interests',
  searchGeolocations: 'meta_search_geolocations',
  listCustomAudiences: 'meta_list_custom_audiences',
  createCustomAudience: 'meta_create_custom_audience',
  updateCampaignStatus: 'meta_update_campaign_status',
  updateAdsetStatus: 'meta_update_adset_status',
  updateAdStatus: 'meta_update_ad_status',
  createCampaign: 'meta_create_campaign',
  createAdset: 'meta_create_adset',
  createAd: 'meta_create_ad',
  updateAdsetBudget: 'meta_update_adset_budget',
  updateAdsetTargeting: 'meta_update_adset_targeting',
  updateAdCreativeCopy: 'meta_update_ad_creative_copy',
  updateAdMedia: 'meta_update_ad_media',
  updateAdTracking: 'meta_update_ad_tracking',
  previewBulkDelete: 'meta_preview_bulk_delete',
  executeBulkDelete: 'meta_execute_bulk_delete',
}

const OPENAPI_TO_MARKETING: Record<string, string> = {
  listSocialAccounts: 'marketing_list_social_accounts',
  listMediaAssets: 'marketing_list_assets',
  uploadMediaAsset: 'marketing_upload_asset',
  deleteMediaAsset: 'marketing_delete_asset',
  getBrandContext: 'marketing_get_brand_context',
  listPosts: 'marketing_list_posts',
  getPost: 'marketing_get_post',
  createPost: 'marketing_create_post',
  updatePost: 'marketing_update_post',
  approvePost: 'marketing_approve_post',
  schedulePost: 'marketing_schedule_post',
  publishPost: 'marketing_publish_post',
  unschedulePost: 'marketing_unschedule_post',
  deletePost: 'marketing_delete_post',
  listEditorialCampaigns: 'marketing_list_campaigns',
  getEditorialCampaign: 'marketing_get_campaign',
  createEditorialCampaign: 'marketing_create_campaign',
  updateEditorialCampaign: 'marketing_update_campaign',
  deleteEditorialCampaign: 'marketing_delete_campaign',
}

/** Strip ChatGPT connector namespace: `Blimber_Hub.meta_create_ad` → `meta_create_ad`. */
export function stripMcpConnectorNamespace(name: string): string {
  const trimmed = name.trim()
  if (!trimmed)
    return trimmed

  // `Blimber_Hub.meta_create_ad` or `Blimber Hub.meta_create_ad`
  const dot = trimmed.match(/^[A-Za-z][A-Za-z0-9_ ]*\.([A-Za-z_][A-Za-z0-9_]*)$/)
  if (dot?.[1])
    return dot[1]

  // Path-style: `/Blimber_Hub/meta_create_ad` or `.../link_xxx/meta_create_ad`
  const path = trimmed.match(/\/(?:link_[a-f0-9]+\/)?([A-Za-z_][A-Za-z0-9_]*)$/i)
  if (path?.[1] && path[1] !== 'link')
    return path[1]

  return trimmed
}

/**
 * Map a requested tools/call name to a registered canonical tool name.
 * Returns null if nothing matches `knownNames`.
 */
export function resolveBlimberMcpToolName(
  requested: string,
  knownNames: Iterable<string>,
): string | null {
  const known = knownNames instanceof Set ? knownNames : new Set(knownNames)
  const raw = requested.trim()
  if (!raw)
    return null

  if (known.has(raw))
    return raw

  const stripped = stripMcpConnectorNamespace(raw)
  if (stripped !== raw && known.has(stripped))
    return stripped

  const fromAds = fromAdsMetaToolName(stripped)
  if (fromAds && known.has(fromAds))
    return fromAds

  const fromOpenApi = OPENAPI_TO_META[stripped] || OPENAPI_TO_MARKETING[stripped]
  if (fromOpenApi && known.has(fromOpenApi))
    return fromOpenApi

  return null
}
