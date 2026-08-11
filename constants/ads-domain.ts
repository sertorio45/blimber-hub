/**
 * Domain boundary for Ads vs Marketing campaigns.
 *
 * - `social_campaigns` → editorial / organic planning in Marketing
 *   (`/marketing/campaigns`). Not paid media.
 * - `marketing_campaigns` → paid Meta Ads schema (legacy persisted table).
 *   Live Ads surfaces prefer provider APIs + `marketing_campaign_cache`.
 * - Ads product routes (`/ads/*`) must never query `social_campaigns` for
 *   paid campaign lists.
 *
 * Prefer future renames:
 * `marketing_editorial_campaigns` vs `marketing_paid_campaigns` — do not rename yet.
 */
export const ADS_PAID_CAMPAIGN_SOURCE = 'live_provider_apis' as const
export const MARKETING_EDITORIAL_CAMPAIGN_TABLE = 'social_campaigns' as const
export const ADS_PAID_CAMPAIGN_TABLE = 'marketing_campaigns' as const
