/**
 * Domain boundary for Ads vs Marketing campaigns & Brand Context.
 *
 * ## Campanhas
 * - `social_campaigns` → editorial / organic planning in Marketing
 *   (`/marketing/campaigns`). Not paid media.
 * - `marketing_campaigns` → paid Meta Ads schema (legacy persisted table).
 *   Live Ads surfaces prefer provider APIs + `marketing_campaign_cache`.
 * - Ads product routes (`/ads/*`) must never query `social_campaigns` for
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
/** Canonical creatives under Marketing. Dual entry: Ads product still uses `/ads/creatives`. */
export const MARKETING_ADS_CREATIVES_ROUTE = '/marketing/ads/creatives' as const
export const ADS_CREATIVES_ROUTE = '/ads/creatives' as const
