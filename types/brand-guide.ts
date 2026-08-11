/**
 * Brand Center contracts aligned with `social_brand_guides`.
 * Prefer JSONB columns + `metadata` over new migrations.
 */

export type BrandColorRole = 'primary' | 'secondary' | 'accent' | 'neutral' | 'other'
export type BrandFontRole = 'heading' | 'body' | 'accent' | 'other'
export type BrandReferenceKind = 'inspiration' | 'style' | 'other'

/** Brand fidelity for AI context (does not trigger generation). */
export type BrandAiFidelity = 'strict' | 'balanced' | 'creative'
export type BrandAiRealism = 'photoreal' | 'stylized' | 'mixed'
export type BrandAiTextInImage = 'allow' | 'avoid' | 'brand_only'
export type BrandAiLogoUsage = 'required' | 'optional' | 'avoid'

export interface BrandColor {
  id: string
  name: string
  hex: string
  role: BrandColorRole
}

export interface BrandFont {
  id: string
  family: string
  role: BrandFontRole
  weights: string[]
  notes: string
}

export interface BrandProduct {
  id: string
  name: string
  description: string
  url: string
  keywords: string[]
}

export interface BrandCompetitor {
  id: string
  name: string
  url: string
  notes: string
  strengths: string
  weaknesses: string
}

export interface BrandReference {
  id: string
  name: string
  url: string
  notes: string
  kind: BrandReferenceKind
}

/** Structured audience (CRM-lite). Summary also persisted in `audience` text column. */
export interface BrandAudienceProfile {
  summary: string
  segments: string[]
  demographics: string
  pains: string[]
  motivations: string[]
  preferredChannels: string[]
}

/** Named visual style (mood / look) — multiple allowed. */
export interface BrandVisualStyle {
  id: string
  name: string
  description: string
}

export interface BrandVisualPhotography {
  /** Overall photography notes / approach. */
  general: string
  lighting: string
  framing: string
  environments: string[]
}

export interface BrandVisualComposition {
  notes: string
  rules: string[]
}

/**
 * Creative direction for people in imagery.
 * Lifestyle / roles / settings only — never discriminatory targeting.
 */
export interface BrandVisualPeople {
  direction: string
  contexts: string[]
  avoid: string[]
}

export interface BrandVisualProductsInImages {
  direction: string
  presentation: string
  contexts: string[]
}

/**
 * Visual Direction block stored in `metadata.visualDirection`.
 * Reference assets are IDs into `media_assets` (no file duplication).
 */
export interface BrandVisualDirection {
  styles: BrandVisualStyle[]
  photography: BrandVisualPhotography
  composition: BrandVisualComposition
  people: BrandVisualPeople
  productsInImages: BrandVisualProductsInImages
  preferredElements: string[]
  forbiddenElements: string[]
  disallowedStyles: string[]
  negativeGuidance: string
  visualReferenceAssetIds: string[]
}

/**
 * AI preparation / context preferences — never triggers image generation.
 * Stored in `metadata.aiPreferences`.
 */
export interface BrandAiPreferences {
  fidelity: BrandAiFidelity
  realism: BrandAiRealism
  textInImage: BrandAiTextInImage
  logo: BrandAiLogoUsage
  preferences: string
  notes: string
}

export interface BrandGuideMetadata {
  audienceProfile?: BrandAudienceProfile
  references?: BrandReference[]
  /** Writing / visual communication style notes (Comunicação → estilo). */
  communicationStyle?: string
  visualDirection?: BrandVisualDirection
  aiPreferences?: BrandAiPreferences
  [key: string]: unknown
}

export interface BrandGuideLogoAsset {
  id: string
  name: string
  mimeType: string
  previewUrl: string | null
  objectPath: string
}

/** Canonical API / UI row for Brand Center (camelCase). */
export interface BrandGuide {
  id: string | null
  tenantId: string | null
  toneOfVoice: string
  audience: string
  allowedWords: string[]
  forbiddenWords: string[]
  ctas: string[]
  hashtags: string[]
  colors: BrandColor[]
  fonts: BrandFont[]
  products: BrandProduct[]
  competitors: BrandCompetitor[]
  restrictions: string
  legalNotes: string
  logoAssetIds: string[]
  logoAssets: BrandGuideLogoAsset[]
  /** Hydrated previews for `metadata.visualDirection.visualReferenceAssetIds`. */
  visualReferenceAssets: BrandGuideLogoAsset[]
  metadata: BrandGuideMetadata
  updatedAt: string | null
  createdAt: string | null
}

export interface BrandGuideInput {
  toneOfVoice?: string
  audience?: string
  allowedWords?: string[]
  forbiddenWords?: string[]
  ctas?: string[]
  hashtags?: string[]
  colors?: BrandColor[]
  fonts?: BrandFont[]
  products?: BrandProduct[]
  competitors?: BrandCompetitor[]
  restrictions?: string
  legalNotes?: string
  logoAssetIds?: string[]
  metadata?: BrandGuideMetadata
}

export type BrandCenterTab
  = | 'overview'
    | 'identity'
    | 'communication'
    | 'audience'
    | 'products'
    | 'competitors'
    | 'restrictions'
    | 'visual'
    | 'ai'

export interface BrandCompletenessSection {
  id: BrandCenterTab | 'logos' | 'colors' | 'fonts' | 'tone' | 'words'
  label: string
  filled: boolean
  weight: number
}

export interface BrandCompleteness {
  percent: number
  sections: BrandCompletenessSection[]
}
