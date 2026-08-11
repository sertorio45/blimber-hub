import type {
  BrandAiFidelity,
  BrandAiLogoUsage,
  BrandAiPreferences,
  BrandAiRealism,
  BrandAiTextInImage,
  BrandAudienceProfile,
  BrandColor,
  BrandColorRole,
  BrandCompetitor,
  BrandCompleteness,
  BrandFont,
  BrandFontRole,
  BrandGuide,
  BrandGuideInput,
  BrandGuideLogoAsset,
  BrandGuideMetadata,
  BrandProduct,
  BrandReference,
  BrandReferenceKind,
  BrandVisualDirection,
  BrandVisualPeople,
  BrandVisualPhotography,
  BrandVisualProductsInImages,
  BrandVisualStyle,
  BrandVisualComposition,
} from '~/types/brand-guide'

const COLOR_ROLES: BrandColorRole[] = ['primary', 'secondary', 'accent', 'neutral', 'other']
const FONT_ROLES: BrandFontRole[] = ['heading', 'body', 'accent', 'other']
const REF_KINDS: BrandReferenceKind[] = ['inspiration', 'style', 'other']
const AI_FIDELITY: BrandAiFidelity[] = ['strict', 'balanced', 'creative']
const AI_REALISM: BrandAiRealism[] = ['photoreal', 'stylized', 'mixed']
const AI_TEXT: BrandAiTextInImage[] = ['allow', 'avoid', 'brand_only']
const AI_LOGO: BrandAiLogoUsage[] = ['required', 'optional', 'avoid']

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function asId(value: unknown): string {
  const raw = asString(value).trim()
  return raw || cryptoRandomId()
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = asString(value) as T
  return allowed.includes(raw) ? raw : fallback
}

export function createEmptyAudienceProfile(summary = ''): BrandAudienceProfile {
  return {
    summary,
    segments: [],
    demographics: '',
    pains: [],
    motivations: [],
    preferredChannels: [],
  }
}

export function createEmptyVisualPhotography(): BrandVisualPhotography {
  return {
    general: '',
    lighting: '',
    framing: '',
    environments: [],
  }
}

export function createEmptyVisualComposition(): BrandVisualComposition {
  return {
    notes: '',
    rules: [],
  }
}

export function createEmptyVisualPeople(): BrandVisualPeople {
  return {
    direction: '',
    contexts: [],
    avoid: [],
  }
}

export function createEmptyVisualProductsInImages(): BrandVisualProductsInImages {
  return {
    direction: '',
    presentation: '',
    contexts: [],
  }
}

export function createEmptyVisualDirection(): BrandVisualDirection {
  return {
    styles: [],
    photography: createEmptyVisualPhotography(),
    composition: createEmptyVisualComposition(),
    people: createEmptyVisualPeople(),
    productsInImages: createEmptyVisualProductsInImages(),
    preferredElements: [],
    forbiddenElements: [],
    disallowedStyles: [],
    negativeGuidance: '',
    visualReferenceAssetIds: [],
  }
}

export function createEmptyAiPreferences(): BrandAiPreferences {
  return {
    fidelity: 'balanced',
    realism: 'mixed',
    textInImage: 'avoid',
    logo: 'optional',
    preferences: '',
    notes: '',
  }
}

export function createEmptyBrandGuide(tenantId: string | null = null): BrandGuide {
  return {
    id: null,
    tenantId,
    toneOfVoice: '',
    audience: '',
    allowedWords: [],
    forbiddenWords: [],
    ctas: [],
    hashtags: [],
    colors: [],
    fonts: [],
    products: [],
    competitors: [],
    restrictions: '',
    legalNotes: '',
    logoAssetIds: [],
    logoAssets: [],
    visualReferenceAssets: [],
    metadata: {
      audienceProfile: createEmptyAudienceProfile(),
      references: [],
      communicationStyle: '',
      visualDirection: createEmptyVisualDirection(),
      aiPreferences: createEmptyAiPreferences(),
    },
    updatedAt: null,
    createdAt: null,
  }
}

function normalizeColor(raw: unknown): BrandColor | null {
  const row = asRecord(raw)
  const hex = asString(row.hex || row.value || row.color).trim()
  if (!hex)
    return null
  const roleRaw = asString(row.role, 'other') as BrandColorRole
  return {
    id: asId(row.id),
    name: asString(row.name, 'Cor'),
    hex: hex.startsWith('#') ? hex : `#${hex}`,
    role: COLOR_ROLES.includes(roleRaw) ? roleRaw : 'other',
  }
}

function normalizeFont(raw: unknown): BrandFont | null {
  const row = asRecord(raw)
  const family = asString(row.family || row.name || row.font).trim()
  if (!family)
    return null
  const roleRaw = asString(row.role, 'body') as BrandFontRole
  return {
    id: asId(row.id),
    family,
    role: FONT_ROLES.includes(roleRaw) ? roleRaw : 'other',
    weights: asStringArray(row.weights),
    notes: asString(row.notes),
  }
}

function normalizeProduct(raw: unknown): BrandProduct | null {
  const row = asRecord(raw)
  const name = asString(row.name || row.title).trim()
  if (!name)
    return null
  return {
    id: asId(row.id),
    name,
    description: asString(row.description),
    url: asString(row.url),
    keywords: asStringArray(row.keywords),
  }
}

function normalizeCompetitor(raw: unknown): BrandCompetitor | null {
  const row = asRecord(raw)
  const name = asString(row.name || row.title).trim()
  if (!name)
    return null
  return {
    id: asId(row.id),
    name,
    url: asString(row.url),
    notes: asString(row.notes),
    strengths: asString(row.strengths),
    weaknesses: asString(row.weaknesses),
  }
}

function normalizeReference(raw: unknown): BrandReference | null {
  const row = asRecord(raw)
  const name = asString(row.name || row.title).trim()
  if (!name)
    return null
  const kindRaw = asString(row.kind, 'inspiration') as BrandReferenceKind
  return {
    id: asId(row.id),
    name,
    url: asString(row.url),
    notes: asString(row.notes),
    kind: REF_KINDS.includes(kindRaw) ? kindRaw : 'other',
  }
}

function normalizeVisualStyle(raw: unknown): BrandVisualStyle | null {
  const row = asRecord(raw)
  const name = asString(row.name || row.title).trim()
  if (!name)
    return null
  return {
    id: asId(row.id),
    name,
    description: asString(row.description),
  }
}

export function normalizeVisualDirection(raw: unknown): BrandVisualDirection {
  const source = asRecord(raw)
  const base = createEmptyVisualDirection()
  const photo = asRecord(source.photography)
  const composition = asRecord(source.composition)
  const people = asRecord(source.people)
  const products = asRecord(source.productsInImages || source.products)

  return {
    styles: Array.isArray(source.styles)
      ? source.styles.map(normalizeVisualStyle).filter((item): item is BrandVisualStyle => Boolean(item))
      : [],
    photography: {
      general: asString(photo.general || source.photographyNotes, base.photography.general),
      lighting: asString(photo.lighting, base.photography.lighting),
      framing: asString(photo.framing, base.photography.framing),
      environments: asStringArray(photo.environments).length
        ? asStringArray(photo.environments)
        : asStringArray(source.environments),
    },
    composition: {
      notes: asString(composition.notes, base.composition.notes),
      rules: asStringArray(composition.rules),
    },
    people: {
      direction: asString(people.direction, base.people.direction),
      contexts: asStringArray(people.contexts),
      avoid: asStringArray(people.avoid),
    },
    productsInImages: {
      direction: asString(products.direction, base.productsInImages.direction),
      presentation: asString(products.presentation, base.productsInImages.presentation),
      contexts: asStringArray(products.contexts),
    },
    preferredElements: asStringArray(source.preferredElements),
    forbiddenElements: asStringArray(source.forbiddenElements),
    disallowedStyles: asStringArray(source.disallowedStyles),
    negativeGuidance: asString(source.negativeGuidance),
    visualReferenceAssetIds: asStringArray(
      source.visualReferenceAssetIds || source.referenceAssetIds,
    ),
  }
}

export function normalizeAiPreferences(raw: unknown): BrandAiPreferences {
  const source = asRecord(raw)
  const base = createEmptyAiPreferences()
  return {
    fidelity: enumOr(source.fidelity, AI_FIDELITY, base.fidelity),
    realism: enumOr(source.realism, AI_REALISM, base.realism),
    textInImage: enumOr(source.textInImage, AI_TEXT, base.textInImage),
    logo: enumOr(source.logo, AI_LOGO, base.logo),
    preferences: asString(source.preferences),
    notes: asString(source.notes || source.observations),
  }
}

function normalizeAudienceProfile(
  metadata: BrandGuideMetadata,
  audienceFallback: string,
): BrandAudienceProfile {
  const raw = asRecord(metadata.audienceProfile)
  const base = createEmptyAudienceProfile(audienceFallback)
  return {
    summary: asString(raw.summary, audienceFallback || base.summary),
    segments: asStringArray(raw.segments),
    demographics: asString(raw.demographics),
    pains: asStringArray(raw.pains),
    motivations: asStringArray(raw.motivations),
    preferredChannels: asStringArray(raw.preferredChannels || raw.channels),
  }
}

function normalizeMetadata(raw: unknown, audienceFallback: string): BrandGuideMetadata {
  const source = asRecord(raw)
  const references = Array.isArray(source.references)
    ? source.references.map(normalizeReference).filter((item): item is BrandReference => Boolean(item))
    : []

  return {
    ...source,
    audienceProfile: normalizeAudienceProfile(source as BrandGuideMetadata, audienceFallback),
    references,
    communicationStyle: asString(source.communicationStyle),
    visualDirection: normalizeVisualDirection(source.visualDirection),
    aiPreferences: normalizeAiPreferences(source.aiPreferences),
  }
}

function normalizeLogoAsset(raw: unknown): BrandGuideLogoAsset | null {
  const row = asRecord(raw)
  const id = asString(row.id).trim()
  if (!id)
    return null
  return {
    id,
    name: asString(row.name || row.file_name, 'Logo'),
    mimeType: asString(row.mimeType || row.mime_type, 'image/*'),
    previewUrl: (row.previewUrl ?? row.preview_url ?? null) as string | null,
    objectPath: asString(row.objectPath || row.object_path),
  }
}

/** Accepts snake_case DB row or camelCase API payload. */
export function normalizeBrandGuide(raw: unknown, tenantId: string | null = null): BrandGuide {
  if (!raw || typeof raw !== 'object')
    return createEmptyBrandGuide(tenantId)

  const row = raw as Record<string, unknown>
  const audience = asString(row.audience ?? row.audienceText)
  const metadata = normalizeMetadata(row.metadata, audience)

  return {
    id: asString(row.id) || null,
    tenantId: asString(row.tenantId || row.tenant_id) || tenantId,
    toneOfVoice: asString(row.toneOfVoice ?? row.tone_of_voice),
    audience: metadata.audienceProfile?.summary || audience,
    allowedWords: asStringArray(row.allowedWords ?? row.allowed_words),
    forbiddenWords: asStringArray(row.forbiddenWords ?? row.forbidden_words),
    ctas: asStringArray(row.ctas),
    hashtags: asStringArray(row.hashtags),
    colors: Array.isArray(row.colors)
      ? row.colors.map(normalizeColor).filter((item): item is BrandColor => Boolean(item))
      : [],
    fonts: Array.isArray(row.fonts)
      ? row.fonts.map(normalizeFont).filter((item): item is BrandFont => Boolean(item))
      : [],
    products: Array.isArray(row.products)
      ? row.products.map(normalizeProduct).filter((item): item is BrandProduct => Boolean(item))
      : [],
    competitors: Array.isArray(row.competitors)
      ? row.competitors.map(normalizeCompetitor).filter((item): item is BrandCompetitor => Boolean(item))
      : [],
    restrictions: asString(row.restrictions),
    legalNotes: asString(row.legalNotes ?? row.legal_notes),
    logoAssetIds: asStringArray(row.logoAssetIds ?? row.logo_asset_ids),
    logoAssets: Array.isArray(row.logoAssets)
      ? row.logoAssets.map(normalizeLogoAsset).filter((item): item is BrandGuideLogoAsset => Boolean(item))
      : [],
    visualReferenceAssets: Array.isArray(row.visualReferenceAssets)
      ? row.visualReferenceAssets.map(normalizeLogoAsset).filter((item): item is BrandGuideLogoAsset => Boolean(item))
      : [],
    metadata,
    updatedAt: asString(row.updatedAt ?? row.updated_at) || null,
    createdAt: asString(row.createdAt ?? row.created_at) || null,
  }
}

export function isVisualDirectionFilled(direction: BrandVisualDirection | undefined | null): boolean {
  if (!direction)
    return false
  return hasList(direction.styles)
    || hasText(direction.photography.general)
    || hasText(direction.photography.lighting)
    || hasText(direction.photography.framing)
    || hasList(direction.photography.environments)
    || hasText(direction.composition.notes)
    || hasList(direction.composition.rules)
    || hasText(direction.people.direction)
    || hasList(direction.people.contexts)
    || hasText(direction.productsInImages.direction)
    || hasText(direction.productsInImages.presentation)
    || hasList(direction.preferredElements)
    || hasList(direction.forbiddenElements)
    || hasList(direction.disallowedStyles)
    || hasText(direction.negativeGuidance)
    || hasList(direction.visualReferenceAssetIds)
}

export function isAiPreferencesFilled(prefs: BrandAiPreferences | undefined | null): boolean {
  if (!prefs)
    return false
  // Defaults alone do not count — need explicit notes/preferences or non-default enums.
  const defaults = createEmptyAiPreferences()
  const enumsChanged = prefs.fidelity !== defaults.fidelity
    || prefs.realism !== defaults.realism
    || prefs.textInImage !== defaults.textInImage
    || prefs.logo !== defaults.logo
  return enumsChanged || hasText(prefs.preferences) || hasText(prefs.notes)
}

/**
 * Apply logo selection in one object so v-model parents never race
 * sequential `logoAssetIds` / `logoAssets` patches.
 */
export function applyBrandLogoSelection(
  guide: BrandGuide,
  selection: { logoAssetIds: string[], logoAssets: BrandGuideLogoAsset[] },
): BrandGuide {
  return {
    ...guide,
    logoAssetIds: [...selection.logoAssetIds],
    logoAssets: [...selection.logoAssets],
  }
}

export function toBrandGuideInput(guide: BrandGuide): BrandGuideInput {
  const audienceSummary = guide.metadata.audienceProfile?.summary || guide.audience
  const visualDirection = guide.metadata.visualDirection || createEmptyVisualDirection()
  const aiPreferences = guide.metadata.aiPreferences || createEmptyAiPreferences()

  // Prefer explicit ids; fall back to logoAssets when a stale dual-patch wiped ids.
  const logoAssetIds = guide.logoAssetIds.length
    ? guide.logoAssetIds
    : guide.logoAssets.map(asset => asset.id).filter(Boolean)

  return {
    toneOfVoice: guide.toneOfVoice,
    audience: audienceSummary,
    allowedWords: guide.allowedWords,
    forbiddenWords: guide.forbiddenWords,
    ctas: guide.ctas,
    hashtags: guide.hashtags,
    colors: guide.colors.filter(color => hasText(color.hex)),
    fonts: guide.fonts.filter(font => hasText(font.family)),
    products: guide.products.filter(product => hasText(product.name)),
    competitors: guide.competitors.filter(item => hasText(item.name)),
    restrictions: guide.restrictions,
    legalNotes: guide.legalNotes,
    logoAssetIds,
    metadata: {
      ...guide.metadata,
      audienceProfile: {
        ...(guide.metadata.audienceProfile || createEmptyAudienceProfile(audienceSummary)),
        summary: audienceSummary,
      },
      references: (guide.metadata.references || []).filter(item => hasText(item.name)),
      communicationStyle: guide.metadata.communicationStyle || '',
      visualDirection: {
        ...visualDirection,
        styles: visualDirection.styles.filter(style => hasText(style.name)),
        photography: {
          ...visualDirection.photography,
          environments: visualDirection.photography.environments.filter(item => hasText(item)),
        },
        composition: {
          ...visualDirection.composition,
          rules: visualDirection.composition.rules.filter(item => hasText(item)),
        },
        people: {
          ...visualDirection.people,
          contexts: visualDirection.people.contexts.filter(item => hasText(item)),
          avoid: visualDirection.people.avoid.filter(item => hasText(item)),
        },
        productsInImages: {
          ...visualDirection.productsInImages,
          contexts: visualDirection.productsInImages.contexts.filter(item => hasText(item)),
        },
        preferredElements: visualDirection.preferredElements.filter(item => hasText(item)),
        forbiddenElements: visualDirection.forbiddenElements.filter(item => hasText(item)),
        disallowedStyles: visualDirection.disallowedStyles.filter(item => hasText(item)),
        visualReferenceAssetIds: visualDirection.visualReferenceAssetIds.filter(item => hasText(item)),
      },
      aiPreferences,
    },
  }
}

function hasText(value: string | undefined | null): boolean {
  return Boolean(value && value.trim())
}

function hasList(value: unknown[] | undefined | null): boolean {
  return Boolean(value && value.length > 0)
}

/** Indicator only — never blocks save/use. */
export function computeBrandCompleteness(guide: BrandGuide): BrandCompleteness {
  const profile = guide.metadata.audienceProfile
  const audienceFilled = hasText(guide.audience)
    || hasText(profile?.demographics)
    || hasList(profile?.segments)
    || hasList(profile?.pains)

  const wordsFilled = hasList(guide.allowedWords)
    || hasList(guide.forbiddenWords)
    || hasList(guide.ctas)
    || hasList(guide.hashtags)
    || hasText(guide.metadata.communicationStyle)

  const sections = [
    { id: 'logos' as const, label: 'Logos', filled: hasList(guide.logoAssetIds), weight: 12 },
    { id: 'colors' as const, label: 'Cores', filled: hasList(guide.colors), weight: 12 },
    { id: 'fonts' as const, label: 'Tipografia', filled: hasList(guide.fonts), weight: 8 },
    { id: 'tone' as const, label: 'Tom de voz', filled: hasText(guide.toneOfVoice), weight: 12 },
    { id: 'words' as const, label: 'Comunicação', filled: wordsFilled, weight: 8 },
    { id: 'audience' as const, label: 'Público', filled: audienceFilled, weight: 12 },
    { id: 'products' as const, label: 'Produtos', filled: hasList(guide.products), weight: 8 },
    {
      id: 'competitors' as const,
      label: 'Concorrentes / referências',
      filled: hasList(guide.competitors) || hasList(guide.metadata.references || []),
      weight: 4,
    },
    {
      id: 'restrictions' as const,
      label: 'Restrições / legal',
      filled: hasText(guide.restrictions) || hasText(guide.legalNotes),
      weight: 4,
    },
    {
      id: 'visual' as const,
      label: 'Direção visual',
      filled: isVisualDirectionFilled(guide.metadata.visualDirection),
      weight: 12,
    },
    {
      id: 'ai' as const,
      label: 'Preferências de IA',
      filled: isAiPreferencesFilled(guide.metadata.aiPreferences),
      weight: 8,
    },
  ]

  const earned = sections.reduce((sum, section) => sum + (section.filled ? section.weight : 0), 0)
  const total = sections.reduce((sum, section) => sum + section.weight, 0)
  const percent = total === 0 ? 0 : Math.round((earned / total) * 100)

  return { percent, sections }
}

export function newBrandColor(partial?: Partial<BrandColor>): BrandColor {
  return {
    id: cryptoRandomId(),
    name: partial?.name || 'Primária',
    hex: partial?.hex || '#2563eb',
    role: partial?.role || 'primary',
  }
}

export function newBrandFont(partial?: Partial<BrandFont>): BrandFont {
  return {
    id: cryptoRandomId(),
    family: partial?.family || '',
    role: partial?.role || 'body',
    weights: partial?.weights || [],
    notes: partial?.notes || '',
  }
}

export function newBrandProduct(partial?: Partial<BrandProduct>): BrandProduct {
  return {
    id: cryptoRandomId(),
    name: partial?.name || '',
    description: partial?.description || '',
    url: partial?.url || '',
    keywords: partial?.keywords || [],
  }
}

export function newBrandCompetitor(partial?: Partial<BrandCompetitor>): BrandCompetitor {
  return {
    id: cryptoRandomId(),
    name: partial?.name || '',
    url: partial?.url || '',
    notes: partial?.notes || '',
    strengths: partial?.strengths || '',
    weaknesses: partial?.weaknesses || '',
  }
}

export function newBrandReference(partial?: Partial<BrandReference>): BrandReference {
  return {
    id: cryptoRandomId(),
    name: partial?.name || '',
    url: partial?.url || '',
    notes: partial?.notes || '',
    kind: partial?.kind || 'inspiration',
  }
}

export function newBrandVisualStyle(partial?: Partial<BrandVisualStyle>): BrandVisualStyle {
  return {
    id: cryptoRandomId(),
    name: partial?.name || '',
    description: partial?.description || '',
  }
}
