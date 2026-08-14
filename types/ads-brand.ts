/**
 * Ads ↔ Brand Context bridge for a future Blimber AI creative pipeline.
 *
 * Architecture only (ETAPA 7) — never triggers image/copy generation.
 *
 * Domain boundary (also `constants/ads-domain.ts`):
 * - `social_campaigns` → editorial Marketing (`/marketing/campaigns`)
 * - Paid Meta/Google (live APIs / `marketing_campaigns`) → Marketing → Ads (`/marketing/ads*`)
 *
 * Future flow:
 *   Paid campaign + Product + BrandContext + Objective → Blimber AI → Copy / Image / Variations
 */

import type { BrandContext } from '~/types/brand-context'
import type { BrandProduct } from '~/types/brand-guide'

/** Paid campaign pointer — never references editorial `social_campaigns`. */
export interface AdsCreativeCampaignRef {
  provider: 'meta' | 'google_ads'
  externalId: string
  name: string
}

export type AdsCreativeObjective =
  | 'awareness'
  | 'traffic'
  | 'engagement'
  | 'leads'
  | 'sales'
  | 'app_promotion'
  | 'other'

/**
 * Inputs the future AI creative pipeline will consume.
 * Assemblers only build this shape — no model calls from Ads.
 */
export interface AdsCreativeGenerationInput {
  tenantId: string
  campaign: AdsCreativeCampaignRef | null
  product: BrandProduct | null
  brand: BrandContext
  objective: AdsCreativeObjective | null
  notes: string
}

/** Compact Brand Context snapshot for Ads UI cards. */
export interface AdsBrandContextSummary {
  tenantId: string
  hasGuide: boolean
  toneOfVoice: string
  communicationStyle: string
  primaryColorHexes: string[]
  completenessPercent: number
  productCount: number
  /** Always Brand Center of the active workspace tenant. */
  brandCenterPath: '/marketing/brand'
}

/** Checklist item shown on `/ads/creatives` (architecture placeholder). */
export interface AdsCreativePipelineFactor {
  id: 'campaign' | 'product' | 'brand' | 'objective'
  label: string
  description: string
}
