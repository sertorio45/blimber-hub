/**
 * Unified Brand Context for future Prompt Builder / Blimber AI.
 * Sourced from Brand Center (`social_brand_guides`) — never triggers generation.
 */

import type {
  BrandAiPreferences,
  BrandAudienceProfile,
  BrandColor,
  BrandCompetitor,
  BrandCompleteness,
  BrandFont,
  BrandGuideLogoAsset,
  BrandProduct,
  BrandReference,
  BrandVisualDirection,
} from '~/types/brand-guide'

/** Logos, colors, typography. */
export interface BrandContextIdentity {
  logoAssetIds: string[]
  logos: BrandGuideLogoAsset[]
  colors: BrandColor[]
  fonts: BrandFont[]
}

/** Visual direction + hydrated reference assets. */
export interface BrandContextVisual {
  direction: BrandVisualDirection
  referenceAssets: BrandGuideLogoAsset[]
}

/** Tone, style, vocabulary, CTAs. */
export interface BrandContextCommunication {
  toneOfVoice: string
  style: string
  allowedWords: string[]
  forbiddenWords: string[]
  ctas: string[]
  hashtags: string[]
}

/** Structured audience (not CRM). */
export interface BrandContextAudiences {
  profile: BrandAudienceProfile
  /** Flat summary (mirrors `audience` / profile.summary). */
  summary: string
}

export interface BrandContextRestrictions {
  restrictions: string
  legalNotes: string
}

/**
 * Canonical read model for AI / prompt pipelines.
 * Shape is stable; generation consumers are out of scope (ETAPA 6).
 */
export interface BrandContext {
  tenantId: string
  guideId: string | null
  updatedAt: string | null
  createdAt: string | null
  completeness: BrandCompleteness
  identity: BrandContextIdentity
  visual: BrandContextVisual
  communication: BrandContextCommunication
  audiences: BrandContextAudiences
  products: BrandProduct[]
  competitors: BrandCompetitor[]
  references: BrandReference[]
  ai: BrandAiPreferences
  restrictions: BrandContextRestrictions
}
