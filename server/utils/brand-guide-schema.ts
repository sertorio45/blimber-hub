import { z } from 'zod'

const colorRoleSchema = z.enum(['primary', 'secondary', 'accent', 'neutral', 'other'])
const fontRoleSchema = z.enum(['heading', 'body', 'accent', 'other'])
const referenceKindSchema = z.enum(['inspiration', 'style', 'other'])
const aiFidelitySchema = z.enum(['strict', 'balanced', 'creative'])
const aiRealismSchema = z.enum(['photoreal', 'stylized', 'mixed'])
const aiTextInImageSchema = z.enum(['allow', 'avoid', 'brand_only'])
const aiLogoSchema = z.enum(['required', 'optional', 'avoid'])

const brandColorSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(80),
  hex: z.string().min(4).max(16),
  role: colorRoleSchema.default('other'),
})

const brandFontSchema = z.object({
  id: z.string().min(1).max(80),
  family: z.string().min(1).max(120),
  role: fontRoleSchema.default('body'),
  weights: z.array(z.string().max(40)).max(20).default([]),
  notes: z.string().max(500).default(''),
})

const brandProductSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).default(''),
  url: z.string().max(500).default(''),
  keywords: z.array(z.string().max(80)).max(40).default([]),
})

const brandCompetitorSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  url: z.string().max(500).default(''),
  notes: z.string().max(2000).default(''),
  strengths: z.string().max(1000).default(''),
  weaknesses: z.string().max(1000).default(''),
})

const brandReferenceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  url: z.string().max(500).default(''),
  notes: z.string().max(2000).default(''),
  kind: referenceKindSchema.default('inspiration'),
})

const visualStyleSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).default(''),
})

const visualPhotographySchema = z.object({
  general: z.string().max(5000).default(''),
  lighting: z.string().max(2000).default(''),
  framing: z.string().max(2000).default(''),
  environments: z.array(z.string().max(160)).max(40).default([]),
})

const visualCompositionSchema = z.object({
  notes: z.string().max(5000).default(''),
  rules: z.array(z.string().max(200)).max(40).default([]),
})

const visualPeopleSchema = z.object({
  direction: z.string().max(5000).default(''),
  contexts: z.array(z.string().max(160)).max(40).default([]),
  avoid: z.array(z.string().max(160)).max(40).default([]),
})

const visualProductsSchema = z.object({
  direction: z.string().max(5000).default(''),
  presentation: z.string().max(2000).default(''),
  contexts: z.array(z.string().max(160)).max(40).default([]),
})

const visualDirectionSchema = z.object({
  styles: z.array(visualStyleSchema).max(20).default([]),
  photography: visualPhotographySchema.default({
    general: '',
    lighting: '',
    framing: '',
    environments: [],
  }),
  composition: visualCompositionSchema.default({ notes: '', rules: [] }),
  people: visualPeopleSchema.default({ direction: '', contexts: [], avoid: [] }),
  productsInImages: visualProductsSchema.default({
    direction: '',
    presentation: '',
    contexts: [],
  }),
  preferredElements: z.array(z.string().max(160)).max(60).default([]),
  forbiddenElements: z.array(z.string().max(160)).max(60).default([]),
  disallowedStyles: z.array(z.string().max(160)).max(40).default([]),
  negativeGuidance: z.string().max(5000).default(''),
  visualReferenceAssetIds: z.array(z.string().uuid()).max(24).default([]),
}).optional()

const aiPreferencesSchema = z.object({
  fidelity: aiFidelitySchema.default('balanced'),
  realism: aiRealismSchema.default('mixed'),
  textInImage: aiTextInImageSchema.default('avoid'),
  logo: aiLogoSchema.default('optional'),
  preferences: z.string().max(5000).default(''),
  notes: z.string().max(5000).default(''),
}).optional()

const audienceProfileSchema = z.object({
  summary: z.string().max(5000).default(''),
  segments: z.array(z.string().max(120)).max(40).default([]),
  demographics: z.string().max(2000).default(''),
  pains: z.array(z.string().max(200)).max(40).default([]),
  motivations: z.array(z.string().max(200)).max(40).default([]),
  preferredChannels: z.array(z.string().max(80)).max(40).default([]),
}).optional()

const metadataSchema = z.object({
  audienceProfile: audienceProfileSchema,
  references: z.array(brandReferenceSchema).max(50).optional(),
  communicationStyle: z.string().max(5000).optional(),
  visualDirection: visualDirectionSchema,
  aiPreferences: aiPreferencesSchema,
}).passthrough().optional()

export const brandGuideBodySchema = z.object({
  toneOfVoice: z.string().max(5000).optional(),
  audience: z.string().max(5000).optional(),
  allowedWords: z.array(z.string().max(80)).max(100).optional(),
  forbiddenWords: z.array(z.string().max(80)).max(100).optional(),
  ctas: z.array(z.string().max(200)).max(50).optional(),
  hashtags: z.array(z.string().max(80)).max(100).optional(),
  colors: z.array(brandColorSchema).max(20).optional(),
  fonts: z.array(brandFontSchema).max(20).optional(),
  products: z.array(brandProductSchema).max(50).optional(),
  competitors: z.array(brandCompetitorSchema).max(50).optional(),
  restrictions: z.string().max(5000).optional(),
  legalNotes: z.string().max(5000).optional(),
  logoAssetIds: z.array(z.string().uuid()).max(20).optional(),
  metadata: metadataSchema,
})

export type BrandGuideBody = z.infer<typeof brandGuideBodySchema>
