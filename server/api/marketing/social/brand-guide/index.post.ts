import { readBody } from 'h3'

import { brandGuideBodySchema } from '~/server/utils/brand-guide-schema'
import {
  fetchBrandGuideForTenant,
  mergeAiPreferences,
  mergeVisualDirection,
} from '~/server/utils/brand-guide'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'
import { createEmptyAudienceProfile, normalizeBrandGuide } from '~/utils/brand-guide'

export default defineEventHandler(async (event) => {
  const body = brandGuideBodySchema.parse(await readBody(event))
  const { client, tenantId, user } = await requireSocialContext(event, 'marketing.social.brand_guide.manage')

  const existing = await fetchBrandGuideForTenant(client, tenantId)
  const audienceSummary = body.audience
    ?? body.metadata?.audienceProfile?.summary
    ?? existing.audience
    ?? ''

  const nextMetadata = {
    ...existing.metadata,
    ...(body.metadata || {}),
    audienceProfile: {
      ...createEmptyAudienceProfile(audienceSummary),
      ...(existing.metadata.audienceProfile || {}),
      ...(body.metadata?.audienceProfile || {}),
      summary: body.metadata?.audienceProfile?.summary || audienceSummary,
    },
    references: body.metadata?.references ?? existing.metadata.references ?? [],
    communicationStyle: body.metadata?.communicationStyle
      ?? existing.metadata.communicationStyle
      ?? '',
    visualDirection: mergeVisualDirection(
      existing.metadata.visualDirection,
      body.metadata?.visualDirection,
    ),
    aiPreferences: mergeAiPreferences(
      existing.metadata.aiPreferences,
      body.metadata?.aiPreferences,
    ),
  }

  const payload = {
    tenant_id: tenantId,
    tone_of_voice: body.toneOfVoice ?? existing.toneOfVoice ?? '',
    audience: audienceSummary,
    allowed_words: body.allowedWords ?? existing.allowedWords ?? [],
    forbidden_words: body.forbiddenWords ?? existing.forbiddenWords ?? [],
    ctas: body.ctas ?? existing.ctas ?? [],
    hashtags: body.hashtags ?? existing.hashtags ?? [],
    colors: body.colors ?? existing.colors ?? [],
    fonts: body.fonts ?? existing.fonts ?? [],
    products: body.products ?? existing.products ?? [],
    competitors: body.competitors ?? existing.competitors ?? [],
    restrictions: body.restrictions ?? existing.restrictions ?? '',
    legal_notes: body.legalNotes ?? existing.legalNotes ?? '',
    logo_asset_ids: body.logoAssetIds ?? existing.logoAssetIds ?? [],
    metadata: nextMetadata,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('social_brand_guides')
    .upsert(payload, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'brand_guide.updated',
    entityType: 'social_brand_guide',
    entityId: data.id,
  })

  const guided = await fetchBrandGuideForTenant(client, tenantId)
  // Prefer freshly upserted scalars if hydration fails somehow.
  return { data: guided.id ? guided : normalizeBrandGuide(data, tenantId) }
})
