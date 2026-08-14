/**
 * Domain boundary for Ads vs Marketing campaigns & Brand Context.
 *
 * ## Campanhas
 * - `social_campaigns` → editorial / organic planning in Marketing
 *   (`/marketing/campaigns`). Not paid media.
 * - `marketing_campaigns` → paid Meta Ads schema (legacy persisted table).
 *   Live Ads surfaces prefer provider APIs + `marketing_campaign_cache`.
 * - Ads paid routes (`/marketing/ads*`, legacy `/ads*` 301) must never query `social_campaigns` for
 *   paid campaign lists.
 *
 * Prefer future renames:
 * `marketing_editorial_campaigns` vs `marketing_paid_campaigns` — do not rename yet.
 *
 * ## Brand Context
 * - Single source: Brand Center (`social_brand_guides`) → `BrandContext`
 *   via `GET /api/marketing/brand/context` / `useBrandContext`.
 * - Ads consumes via `useAdsBrandContext` + `types/ads-brand.ts`.
 * - Always scoped to the active workspace tenant (agency client switcher).
 * - Brand Center write UI is agency-owned (`audience: agency` + portal blocklist).
 *   Client portal may peek Brand Context on Ads but must not open `/marketing/brand`.
 * - Dual creatives entry until a later `/ads` 301: Marketing canonical + Ads product.
 * - Future creatives: campaign + product + brand + objective → Blimber AI.
 *   No image/copy generation in this stage.
 */

export const ADS_PAID_CAMPAIGN_SOURCE = 'live_provider_apis' as const
export const MARKETING_EDITORIAL_CAMPAIGN_TABLE = 'social_campaigns' as const
export const ADS_PAID_CAMPAIGN_TABLE = 'marketing_campaigns' as const

/** Brand Context is owned by Marketing Brand Center — Ads only reads. */
export const ADS_BRAND_CONTEXT_API = '/api/marketing/brand/context' as const
export const ADS_BRAND_CENTER_ROUTE = '/marketing/brand' as const
/** Canonical creatives under Marketing. Legacy `/ads/creatives` 301s here. */
export const MARKETING_ADS_CREATIVES_ROUTE = '/marketing/ads/creatives' as const
export const ADS_CREATIVES_ROUTE = '/ads/creatives' as const

/** Marketing settings hub — Brand Center. Ads has no dedicated `/ads/settings` page. */
export const MARKETING_SETTINGS_ROUTE = '/marketing/settings' as const
export const SETTINGS_INTEGRATIONS_ROUTE = '/settings/integrations' as const

/** Dummy Etapa 5 URLs — OAuth lives only at `/settings/integrations`. */
export const MARKETING_SETTINGS_REDIRECTS = {
  '/marketing/settings/ad-accounts': SETTINGS_INTEGRATIONS_ROUTE,
  '/marketing/settings/integrations': SETTINGS_INTEGRATIONS_ROUTE,
} as const

export const MARKETING_REPORTS_ADS_ROUTE = '/marketing/reports/ads' as const
export const MARKETING_REPORTS_ANALYTICS_ROUTE = '/marketing/reports/analytics' as const

/** After the unified reports hub exists. */
export const MARKETING_REPORTS_REDIRECTS = {
  '/marketing/ads/reports': MARKETING_REPORTS_ADS_ROUTE,
  '/marketing/ads/analytics': MARKETING_REPORTS_ANALYTICS_ROUTE,
} as const

/**
 * Bookmarks on the old Ads product shell (ETAPA 7).
 * Do not map `/ads/**` as a glob — integrations/settings have distinct targets.
 */
export const ADS_LEGACY_REDIRECTS = {
  '/ads': '/marketing/ads',
  '/ads/campaigns': '/marketing/ads/campaigns',
  '/ads/creatives': '/marketing/ads/creatives',
  '/ads/reports': MARKETING_REPORTS_ADS_ROUTE,
  '/ads/meta': '/marketing/ads/meta',
  '/ads/google': '/marketing/ads/google',
  '/ads/analytics': MARKETING_REPORTS_ANALYTICS_ROUTE,
  '/ads/integrations': SETTINGS_INTEGRATIONS_ROUTE,
  '/ads/settings': MARKETING_SETTINGS_ROUTE,
} as const
