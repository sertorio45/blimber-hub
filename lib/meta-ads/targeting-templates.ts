/**
 * Closed targeting templates for Meta adset create (Etapa 3).
 * No free-form Graph targeting — GPT must pick a whitelist id.
 */

export const META_ADSET_TARGETING_TEMPLATE_IDS = [
  'BR_18_65',
  'BR_25_54',
  'BR_18_34',
  'BR_35_65',
] as const

export type MetaAdsetTargetingTemplateId =
  (typeof META_ADSET_TARGETING_TEMPLATE_IDS)[number]

export interface MetaAdsetTargetingTemplate {
  id: MetaAdsetTargetingTemplateId
  label: string
  /** Human-readable summary for dry-run preview notes. */
  summary: string
  /** Payload accepted by Meta Graph `targeting` field. */
  targeting: {
    geo_locations: { countries: string[] }
    age_min: number
    age_max: number
  }
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
