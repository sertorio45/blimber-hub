import type {
  AdsBrandContextSummary,
  AdsCreativeCampaignRef,
  AdsCreativeGenerationInput,
  AdsCreativeObjective,
  AdsCreativePipelineFactor,
} from '~/types/ads-brand'
import type { BrandContext } from '~/types/brand-context'
import type { BrandProduct } from '~/types/brand-guide'
import { ADS_BRAND_CENTER_ROUTE } from '~/constants/ads-domain'
import { createEmptyBrandContext, isBrandContextForTenant } from '~/utils/brand-context'

export const ADS_BRAND_CENTER_PATH = ADS_BRAND_CENTER_ROUTE

/** Factors the future AI creative pipeline will combine — UI checklist only. */
export const ADS_CREATIVE_PIPELINE_FACTORS: readonly AdsCreativePipelineFactor[] = [
  {
    id: 'campaign',
    label: 'Campanha paga',
    description: 'Campanha Meta ou Google Ads do tenant (nunca social_campaigns editorial).',
  },
  {
    id: 'product',
    label: 'Produto',
    description: 'Produto cadastrado no Brand Center do cliente selecionado.',
  },
  {
    id: 'brand',
    label: 'Marca (Brand Context)',
    description: 'Identidade, tom, cores, restrições e preferências de IA do tenant.',
  },
  {
    id: 'objective',
    label: 'Objetivo',
    description: 'Objetivo de mídia paga (tráfego, leads, vendas, etc.).',
  },
] as const

/**
 * Maps BrandContext into a compact Ads UI summary.
 * Colors prefer primary role, then any hex (max 4 swatches).
 */
export function toAdsBrandContextSummary(context: BrandContext): AdsBrandContextSummary {
  const ordered = [
    ...context.identity.colors.filter(c => c.role === 'primary'),
    ...context.identity.colors.filter(c => c.role !== 'primary'),
  ]
  const primaryColorHexes = ordered
    .map(c => c.hex)
    .filter(Boolean)
    .slice(0, 4)

  return {
    tenantId: context.tenantId,
    hasGuide: Boolean(context.guideId),
    toneOfVoice: context.communication.toneOfVoice.trim(),
    communicationStyle: context.communication.style.trim(),
    primaryColorHexes,
    completenessPercent: context.completeness.percent,
    productCount: context.products.length,
    brandCenterPath: ADS_BRAND_CENTER_PATH,
  }
}

/**
 * Assembles the future generation input shape without calling any model.
 * Rejects brand bound to another tenant (agency workspace safety).
 */
export function buildAdsCreativeGenerationInput(options: {
  tenantId: string
  brand: BrandContext
  campaign?: AdsCreativeCampaignRef | null
  product?: BrandProduct | null
  objective?: AdsCreativeObjective | null
  notes?: string
}): AdsCreativeGenerationInput {
  const tenantId = options.tenantId.trim()
  if (!tenantId)
    throw new Error('tenantId is required for Ads creative input')

  if (!isBrandContextForTenant(options.brand, tenantId)) {
    throw new Error('Brand Context tenant does not match the active Ads workspace tenant')
  }

  return {
    tenantId,
    campaign: options.campaign ?? null,
    product: options.product ?? null,
    brand: options.brand,
    objective: options.objective ?? null,
    notes: options.notes?.trim() || '',
  }
}

export function createEmptyAdsCreativeGenerationInput(tenantId = ''): AdsCreativeGenerationInput {
  const id = tenantId.trim()
  return {
    tenantId: id,
    campaign: null,
    product: null,
    brand: createEmptyBrandContext(id),
    objective: null,
    notes: '',
  }
}
