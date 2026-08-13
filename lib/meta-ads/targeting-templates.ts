/**
 * Adset targeting: closed BR_* presets OR validated custom Meta Graph targeting.
 * Exactly one of targetingTemplate | targeting must be provided by callers.
 */

import { z } from 'zod'

export const META_ADSET_TARGETING_TEMPLATE_IDS = [
  'BR_18_65',
  'BR_25_54',
  'BR_18_34',
  'BR_35_65',
] as const

export type MetaAdsetTargetingTemplateId =
  (typeof META_ADSET_TARGETING_TEMPLATE_IDS)[number]

/** Minimal Graph targeting shape used by BR_* presets. */
export interface MetaAdsetTemplateTargeting {
  geo_locations: { countries: string[] }
  age_min: number
  age_max: number
}

export interface MetaAdsetTargetingTemplate {
  id: MetaAdsetTargetingTemplateId
  label: string
  /** Human-readable summary for dry-run preview notes. */
  summary: string
  /** Payload accepted by Meta Graph `targeting` field. */
  targeting: MetaAdsetTemplateTargeting
}

export const META_ADSET_TARGETING_TEMPLATES: Record<
  MetaAdsetTargetingTemplateId,
  MetaAdsetTargetingTemplate
> = {
  BR_18_65: {
    id: 'BR_18_65',
    label: 'Brasil, 18–65 anos',
    summary: 'geo=BR · idade 18–65',
    targeting: {
      geo_locations: { countries: ['BR'] },
      age_min: 18,
      age_max: 65,
    },
  },
  BR_25_54: {
    id: 'BR_25_54',
    label: 'Brasil, 25–54 anos',
    summary: 'geo=BR · idade 25–54',
    targeting: {
      geo_locations: { countries: ['BR'] },
      age_min: 25,
      age_max: 54,
    },
  },
  BR_18_34: {
    id: 'BR_18_34',
    label: 'Brasil, 18–34 anos',
    summary: 'geo=BR · idade 18–34',
    targeting: {
      geo_locations: { countries: ['BR'] },
      age_min: 18,
      age_max: 34,
    },
  },
  BR_35_65: {
    id: 'BR_35_65',
    label: 'Brasil, 35–65 anos',
    summary: 'geo=BR · idade 35–65',
    targeting: {
      geo_locations: { countries: ['BR'] },
      age_min: 35,
      age_max: 65,
    },
  },
}

export function resolveAdsetTargetingTemplate(
  templateId: MetaAdsetTargetingTemplateId,
): MetaAdsetTargetingTemplate {
  return META_ADSET_TARGETING_TEMPLATES[templateId]
}

const metaTargetingIdNameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
})

const metaGeoCitySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  radius: z.number().positive().max(80).optional(),
  distance_unit: z.enum(['kilometer', 'mile']).optional(),
})

const metaGeoRegionSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
})

const metaCustomAudienceRefSchema = z.object({
  id: z.string().min(1),
})

const metaFlexibleSpecEntrySchema = z
  .object({
    interests: z.array(metaTargetingIdNameSchema).max(50).optional(),
    behaviors: z.array(metaTargetingIdNameSchema).max(50).optional(),
  })
  .strict()

/**
 * Validated subset of Meta Marketing API `targeting` for create/update adset.
 * Convenience `interests` / `behaviors` at top-level are mapped into flexible_spec.
 */
export const metaCustomTargetingSchema = z
  .object({
    age_min: z.number().int().min(13).max(65).optional(),
    age_max: z.number().int().min(13).max(65).optional(),
    /** 1 = male, 2 = female (Meta Graph). Omit = all. */
    genders: z.array(z.union([z.literal(1), z.literal(2)])).min(1).max(2).optional(),
    geo_locations: z
      .object({
        countries: z.array(z.string().length(2)).max(50).optional(),
        cities: z.array(metaGeoCitySchema).max(50).optional(),
        regions: z.array(metaGeoRegionSchema).max(50).optional(),
        location_types: z
          .array(z.enum(['home', 'recent', 'travel_in']))
          .max(3)
          .optional(),
      })
      .strict()
      .optional(),
    locales: z.array(z.number().int().positive()).max(50).optional(),
    /** Convenience: AND group → flexible_spec[0].interests */
    interests: z.array(metaTargetingIdNameSchema).max(50).optional(),
    /** Convenience: AND group → flexible_spec[0].behaviors */
    behaviors: z.array(metaTargetingIdNameSchema).max(50).optional(),
    flexible_spec: z.array(metaFlexibleSpecEntrySchema).max(10).optional(),
    exclusions: z
      .object({
        interests: z.array(metaTargetingIdNameSchema).max(50).optional(),
        behaviors: z.array(metaTargetingIdNameSchema).max(50).optional(),
      })
      .strict()
      .optional(),
    custom_audiences: z.array(metaCustomAudienceRefSchema).max(50).optional(),
    excluded_custom_audiences: z.array(metaCustomAudienceRefSchema).max(50).optional(),
    publisher_platforms: z
      .array(z.enum(['facebook', 'instagram', 'audience_network', 'messenger']))
      .min(1)
      .max(4)
      .optional(),
    facebook_positions: z.array(z.string().min(1)).max(20).optional(),
    instagram_positions: z.array(z.string().min(1)).max(20).optional(),
    device_platforms: z.array(z.enum(['mobile', 'desktop'])).min(1).max(2).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const geo = data.geo_locations
    const hasGeo = Boolean(
      (geo?.countries && geo.countries.length > 0)
      || (geo?.cities && geo.cities.length > 0)
      || (geo?.regions && geo.regions.length > 0),
    )
    if (!hasGeo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'targeting.geo_locations exige ao menos countries, cities ou regions (ex.: countries: ["BR"]).',
        path: ['geo_locations'],
      })
    }
    if (data.age_min != null && data.age_max != null && data.age_min > data.age_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'age_min não pode ser maior que age_max.',
        path: ['age_min'],
      })
    }
    if (data.interests?.length && data.flexible_spec?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use interests OU flexible_spec, não ambos.',
        path: ['interests'],
      })
    }
    if (data.behaviors?.length && data.flexible_spec?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use behaviors OU flexible_spec, não ambos.',
        path: ['behaviors'],
      })
    }
  })

export type MetaCustomTargetingInput = z.infer<typeof metaCustomTargetingSchema>

/** Advantage+ audience flag required by Marketing API v23+ (`targeting_automation`). */
export type MetaAdvantageAudience = 0 | 1

/** Default for constrained BAU (age/geo presets and custom constraints): Advantage+ audience off. */
export const META_ADVANTAGE_AUDIENCE_DEFAULT: MetaAdvantageAudience = 0

/** Graph-ready targeting object (no convenience aliases). */
export type MetaGraphTargeting = {
  age_min?: number
  age_max?: number
  genders?: Array<1 | 2>
  geo_locations: {
    countries?: string[]
    cities?: Array<{
      key: string
      name?: string
      radius?: number
      distance_unit?: 'kilometer' | 'mile'
    }>
    regions?: Array<{ key: string, name?: string }>
    location_types?: Array<'home' | 'recent' | 'travel_in'>
  }
  locales?: number[]
  flexible_spec?: Array<{
    interests?: Array<{ id: string, name?: string }>
    behaviors?: Array<{ id: string, name?: string }>
  }>
  exclusions?: {
    interests?: Array<{ id: string, name?: string }>
    behaviors?: Array<{ id: string, name?: string }>
  }
  custom_audiences?: Array<{ id: string }>
  excluded_custom_audiences?: Array<{ id: string }>
  publisher_platforms?: Array<'facebook' | 'instagram' | 'audience_network' | 'messenger'>
  facebook_positions?: string[]
  instagram_positions?: string[]
  device_platforms?: Array<'mobile' | 'desktop'>
  /** Required on Graph v23+ when age/geo/gender constraints are set. */
  targeting_automation?: {
    advantage_audience: MetaAdvantageAudience
  }
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined)
      out[key] = value
  }
  return out as Partial<T>
}

/**
 * Maps validated custom targeting input to Meta Graph `targeting` payload.
 */
export function buildMetaGraphTargeting(
  input: MetaCustomTargetingInput,
): MetaGraphTargeting {
  const geo = input.geo_locations!
  const geo_locations = omitUndefined({
    countries: geo.countries?.length ? geo.countries.map(c => c.toUpperCase()) : undefined,
    cities: geo.cities?.length ? geo.cities : undefined,
    regions: geo.regions?.length ? geo.regions : undefined,
    location_types: geo.location_types?.length ? geo.location_types : undefined,
  }) as MetaGraphTargeting['geo_locations']

  let flexible_spec = input.flexible_spec
  if (!flexible_spec?.length && (input.interests?.length || input.behaviors?.length)) {
    flexible_spec = [
      omitUndefined({
        interests: input.interests?.length ? input.interests : undefined,
        behaviors: input.behaviors?.length ? input.behaviors : undefined,
      }) as NonNullable<MetaGraphTargeting['flexible_spec']>[number],
    ]
  }

  return omitUndefined({
    age_min: input.age_min,
    age_max: input.age_max,
    genders: input.genders,
    geo_locations,
    locales: input.locales?.length ? input.locales : undefined,
    flexible_spec: flexible_spec?.length ? flexible_spec : undefined,
    exclusions: input.exclusions
      ? omitUndefined({
          interests: input.exclusions.interests?.length ? input.exclusions.interests : undefined,
          behaviors: input.exclusions.behaviors?.length ? input.exclusions.behaviors : undefined,
        })
      : undefined,
    custom_audiences: input.custom_audiences?.length ? input.custom_audiences : undefined,
    excluded_custom_audiences: input.excluded_custom_audiences?.length
      ? input.excluded_custom_audiences
      : undefined,
    publisher_platforms: input.publisher_platforms,
    facebook_positions: input.facebook_positions?.length ? input.facebook_positions : undefined,
    instagram_positions: input.instagram_positions?.length ? input.instagram_positions : undefined,
    device_platforms: input.device_platforms,
  }) as MetaGraphTargeting
}

export function summarizeMetaGraphTargeting(targeting: MetaGraphTargeting): string {
  const parts: string[] = []
  const countries = targeting.geo_locations.countries
  if (countries?.length)
    parts.push(`geo=${countries.join(',')}`)
  if (targeting.geo_locations.cities?.length)
    parts.push(`cities=${targeting.geo_locations.cities.length}`)
  if (targeting.geo_locations.regions?.length)
    parts.push(`regions=${targeting.geo_locations.regions.length}`)
  if (targeting.age_min != null || targeting.age_max != null) {
    parts.push(`idade ${targeting.age_min ?? '?'}-${targeting.age_max ?? '?'}`)
  }
  if (targeting.genders?.length) {
    const labels = targeting.genders.map(g => (g === 1 ? 'M' : 'F')).join('+')
    parts.push(`gênero=${labels}`)
  }
  const interestCount = targeting.flexible_spec?.reduce(
    (n, s) => n + (s.interests?.length ?? 0),
    0,
  ) ?? 0
  const behaviorCount = targeting.flexible_spec?.reduce(
    (n, s) => n + (s.behaviors?.length ?? 0),
    0,
  ) ?? 0
  if (interestCount)
    parts.push(`interesses=${interestCount}`)
  if (behaviorCount)
    parts.push(`comportamentos=${behaviorCount}`)
  if (targeting.custom_audiences?.length)
    parts.push(`custom_audiences=${targeting.custom_audiences.length}`)
  if (targeting.excluded_custom_audiences?.length)
    parts.push(`excluded_audiences=${targeting.excluded_custom_audiences.length}`)
  if (targeting.publisher_platforms?.length)
    parts.push(`platforms=${targeting.publisher_platforms.join(',')}`)
  if (targeting.locales?.length)
    parts.push(`locales=${targeting.locales.length}`)
  return parts.length ? parts.join(' · ') : 'targeting customizado'
}

export interface ResolvedAdsetTargeting {
  /** Template id when preset was used; null for custom. */
  targetingTemplate: MetaAdsetTargetingTemplateId | null
  targeting: MetaGraphTargeting
  summary: string
  source: 'template' | 'custom'
  /** Value sent as targeting.targeting_automation.advantage_audience */
  advantageAudience: MetaAdvantageAudience
}

export interface ResolveAdsetTargetingInput {
  targetingTemplate?: MetaAdsetTargetingTemplateId | null
  targeting?: MetaCustomTargetingInput | null
  /**
   * Advantage+ audience (Graph v23+). Default 0 for constrained BAU.
   * Pass 1 only when the caller explicitly opts into Advantage+ audience.
   */
  advantageAudience?: MetaAdvantageAudience | null
}

/**
 * Always attaches targeting_automation.advantage_audience (required on Graph v23+).
 * Default 0 keeps age/geo/gender constraints as original audience (not Advantage+).
 */
export function withAdvantageAudience(
  targeting: MetaGraphTargeting,
  advantageAudience: MetaAdvantageAudience = META_ADVANTAGE_AUDIENCE_DEFAULT,
): MetaGraphTargeting {
  return {
    ...targeting,
    targeting_automation: {
      advantage_audience: advantageAudience,
    },
  }
}

/**
 * Resolves BR_* preset or custom targeting. Callers must pass exactly one source
 * (Zod schemas enforce XOR before this runs).
 * Always injects targeting_automation.advantage_audience (default 0).
 */
export function resolveAdsetTargeting(
  input: ResolveAdsetTargetingInput,
): ResolvedAdsetTargeting {
  const hasTemplate = Boolean(input.targetingTemplate)
  const hasCustom = input.targeting != null
  const advantageAudience: MetaAdvantageAudience
    = input.advantageAudience === 1 ? 1 : META_ADVANTAGE_AUDIENCE_DEFAULT

  if (hasTemplate && hasCustom) {
    throw new Error('Informe targetingTemplate OU targeting, não ambos.')
  }
  if (!hasTemplate && !hasCustom) {
    throw new Error('Informe targetingTemplate (BR_*) ou targeting (objeto customizado).')
  }

  if (hasTemplate) {
    const template = resolveAdsetTargetingTemplate(input.targetingTemplate!)
    const targeting = withAdvantageAudience(template.targeting, advantageAudience)
    return {
      targetingTemplate: template.id,
      targeting,
      summary: template.summary,
      source: 'template',
      advantageAudience,
    }
  }

  const parsed = metaCustomTargetingSchema.parse(input.targeting)
  const targeting = withAdvantageAudience(buildMetaGraphTargeting(parsed), advantageAudience)
  return {
    targetingTemplate: null,
    targeting,
    summary: summarizeMetaGraphTargeting(targeting),
    source: 'custom',
    advantageAudience,
  }
}

/** Shared XOR refine for create/update schemas (Portuguese messages). */
export function refineTargetingXor(
  data: { targetingTemplate?: string | null, targeting?: unknown },
  ctx: z.RefinementCtx,
): void {
  const hasTemplate = data.targetingTemplate != null && data.targetingTemplate !== ''
  const hasCustom = data.targeting != null
  if (hasTemplate && hasCustom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe targetingTemplate OU targeting, não ambos.',
      path: ['targeting'],
    })
  }
  if (!hasTemplate && !hasCustom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe targetingTemplate (BR_*) ou targeting (objeto customizado).',
      path: ['targetingTemplate'],
    })
  }
}

/** Billing events allowed on create adset (MVP whitelist). */
export const META_ADSET_BILLING_EVENTS = [
  'IMPRESSIONS',
  'LINK_CLICKS',
] as const

export type MetaAdsetBillingEvent = (typeof META_ADSET_BILLING_EVENTS)[number]

/** Optimization goals allowed on create adset (MVP whitelist — no Advantage+/catalog). */
export const META_ADSET_OPTIMIZATION_GOALS = [
  'REACH',
  'IMPRESSIONS',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'OFFSITE_CONVERSIONS',
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'CONVERSATIONS',
  'THRUPLAY',
  'POST_ENGAGEMENT',
] as const

export type MetaAdsetOptimizationGoal = (typeof META_ADSET_OPTIMIZATION_GOALS)[number]
