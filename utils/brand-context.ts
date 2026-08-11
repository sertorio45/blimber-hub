import type { BrandContext } from '~/types/brand-context'
import type { BrandGuide } from '~/types/brand-guide'
import {
  computeBrandCompleteness,
  createEmptyAiPreferences,
  createEmptyAudienceProfile,
  createEmptyBrandGuide,
  createEmptyVisualDirection,
} from '~/utils/brand-guide'

/**
 * Maps a normalized BrandGuide (UI/API row) into the unified BrandContext contract.
 * Always stamps `tenantId` from the guide (or explicit override) for tenant isolation.
 */
export function toBrandContext(
  guide: BrandGuide,
  options?: { tenantId?: string },
): BrandContext {
  const tenantId = (options?.tenantId ?? guide.tenantId ?? '').trim()
  const visualDirection = guide.metadata.visualDirection || createEmptyVisualDirection()
  const ai = guide.metadata.aiPreferences || createEmptyAiPreferences()
  const audienceFallback = guide.audience || ''
  const profile = guide.metadata.audienceProfile || createEmptyAudienceProfile(audienceFallback)
  const summary = profile.summary || audienceFallback

  return {
    tenantId,
    guideId: guide.id,
    updatedAt: guide.updatedAt,
    createdAt: guide.createdAt,
    completeness: computeBrandCompleteness(guide),
    identity: {
      logoAssetIds: [...guide.logoAssetIds],
      logos: [...guide.logoAssets],
      colors: [...guide.colors],
      fonts: [...guide.fonts],
    },
    visual: {
      direction: {
        ...visualDirection,
        styles: [...visualDirection.styles],
        photography: {
          ...visualDirection.photography,
          environments: [...visualDirection.photography.environments],
        },
        composition: {
          ...visualDirection.composition,
          rules: [...visualDirection.composition.rules],
        },
        people: {
          ...visualDirection.people,
          contexts: [...visualDirection.people.contexts],
          avoid: [...visualDirection.people.avoid],
        },
        productsInImages: {
          ...visualDirection.productsInImages,
          contexts: [...visualDirection.productsInImages.contexts],
        },
        preferredElements: [...visualDirection.preferredElements],
        forbiddenElements: [...visualDirection.forbiddenElements],
        disallowedStyles: [...visualDirection.disallowedStyles],
        visualReferenceAssetIds: [...visualDirection.visualReferenceAssetIds],
      },
      referenceAssets: [...guide.visualReferenceAssets],
    },
    communication: {
      toneOfVoice: guide.toneOfVoice,
      style: guide.metadata.communicationStyle || '',
      allowedWords: [...guide.allowedWords],
      forbiddenWords: [...guide.forbiddenWords],
      ctas: [...guide.ctas],
      hashtags: [...guide.hashtags],
    },
    audiences: {
      profile: {
        ...profile,
        segments: [...profile.segments],
        pains: [...profile.pains],
        motivations: [...profile.motivations],
        preferredChannels: [...profile.preferredChannels],
        summary,
      },
      summary,
    },
    products: [...guide.products],
    competitors: [...guide.competitors],
    references: [...(guide.metadata.references || [])],
    ai: { ...ai },
    restrictions: {
      restrictions: guide.restrictions,
      legalNotes: guide.legalNotes,
    },
  }
}

export function createEmptyBrandContext(tenantId = ''): BrandContext {
  return toBrandContext(createEmptyBrandGuide(tenantId || null), { tenantId })
}

/** True when context is bound to the expected workspace tenant. */
export function isBrandContextForTenant(context: BrandContext, tenantId: string): boolean {
  const expected = tenantId.trim()
  return Boolean(expected) && context.tenantId === expected
}
