/**
 * Flexible Ad Format — creative_asset_groups_spec (Graph v25+).
 *
 * Allows grouping multiple images/videos + text variations in a single ad
 * without specifying format; Meta delivery system picks optimal combination.
 *
 * Constraints (Marketing API docs):
 * - Only OUTCOME_SALES and OUTCOME_APP_PROMOTION objectives
 * - Each group: ≥1 image or video, ≤5 texts per text_type, same CTA type
 * - Field lives on the /ads endpoint (not /adcreatives)
 * - Removed from Ads Manager UI in March 2026, but API remains functional
 *
 * This module is intentionally SEPARATE from:
 * - asset_feed_spec (Dynamic Creative legacy, requires is_dynamic_creative adset)
 * - degrees_of_freedom_spec / pac_relaxation (Advantage+ creative features)
 * - Ad Creative Tests (split test via ad_studies)
 */

import { z } from 'zod'
import { MetaAdsToolError } from './types'
import type { MetaGraphFetch } from './types'
import {
  actPath,
  metaGraphUrl,
  resolveMetaGraphVersion,
} from './graph'

export const FLEXIBLE_AD_TEXT_TYPES = [
  'primary_text',
  'headline',
  'description',
] as const

export type FlexibleAdTextType = (typeof FLEXIBLE_AD_TEXT_TYPES)[number]

export const FLEXIBLE_AD_SUPPORTED_OBJECTIVES = [
  'OUTCOME_SALES',
  'OUTCOME_APP_PROMOTION',
] as const

export type FlexibleAdAssetInput = {
  imageHash?: string
  videoId?: string
  /** Optional thumbnail hash for video assets. */
  videoThumbnailHash?: string
  label?: string
}

export type FlexibleAdTextInput = {
  text: string
  textType: FlexibleAdTextType
  label?: string
}

export type FlexibleAdCallToAction = {
  type: string
  link: string
}

export type FlexibleAdGroupInput = {
  assets: FlexibleAdAssetInput[]
  texts: FlexibleAdTextInput[]
  callToAction: FlexibleAdCallToAction
}

export type CreateFlexibleAdInput = {
  adsetId: string
  name: string
  status?: 'ACTIVE' | 'PAUSED'
  groups: FlexibleAdGroupInput[]
}

/**
 * Validates a single asset group against Marketing API constraints.
 */
function validateGroup(group: FlexibleAdGroupInput, index: number) {
  const images = group.assets.filter(a => a.imageHash && !a.videoId)
  const videos = group.assets.filter(a => a.videoId)

  if (images.length === 0 && videos.length === 0) {
    throw new MetaAdsToolError(
      'FLEXIBLE_GROUP_MEDIA_REQUIRED',
      `Grupo ${index}: necessita ao menos 1 imagem ou vídeo.`,
      400,
      { groupIndex: index },
    )
  }

  const textsByType = new Map<string, number>()
  for (const t of group.texts) {
    const count = (textsByType.get(t.textType) ?? 0) + 1
    textsByType.set(t.textType, count)
    if (count > 5) {
      throw new MetaAdsToolError(
        'FLEXIBLE_GROUP_TEXT_LIMIT',
        `Grupo ${index}: máximo 5 textos por text_type (${t.textType} tem ${count}).`,
        400,
        { groupIndex: index, textType: t.textType },
      )
    }
  }

  if (!group.callToAction?.type || !group.callToAction?.link) {
    throw new MetaAdsToolError(
      'FLEXIBLE_GROUP_CTA_REQUIRED',
      `Grupo ${index}: callToAction.type e callToAction.link são obrigatórios.`,
      400,
      { groupIndex: index },
    )
  }
}

/**
 * Builds the creative_asset_groups_spec JSON for the Graph API.
 */
export function buildCreativeAssetGroupsSpec(groups: FlexibleAdGroupInput[]): Record<string, unknown> {
  if (!groups.length) {
    throw new MetaAdsToolError(
      'FLEXIBLE_GROUPS_EMPTY',
      'creative_asset_groups_spec exige ao menos 1 grupo.',
      400,
    )
  }

  groups.forEach((g, i) => validateGroup(g, i))

  // Validate all groups share the same CTA type
  const ctaTypes = new Set(groups.map(g => g.callToAction.type))
  if (ctaTypes.size > 1) {
    throw new MetaAdsToolError(
      'FLEXIBLE_CTA_TYPE_MISMATCH',
      'Todos os grupos devem usar o mesmo call_to_action.type (requisito da API).',
      400,
      { types: [...ctaTypes] },
    )
  }

  return {
    groups: groups.map((group) => {
      const images = group.assets
        .filter(a => a.imageHash && !a.videoId)
        .map(a => ({ hash: a.imageHash }))

      const videos = group.assets
        .filter(a => a.videoId)
        .map((a) => {
          const v: Record<string, unknown> = { video_id: a.videoId }
          if (a.videoThumbnailHash) v.image_hash = a.videoThumbnailHash
          return v
        })

      const texts = group.texts.map(t => ({
        text: t.text,
        text_type: t.textType,
      }))

      const entry: Record<string, unknown> = { texts }
      if (images.length) entry.images = images
      if (videos.length) entry.videos = videos
      entry.call_to_action = {
        type: group.callToAction.type,
        value: { link: group.callToAction.link },
      }
      return entry
    }),
  }
}

/**
 * Checks eligibility for Flexible Ad Format on an ad account.
 * Validates Graph version and returns supported objectives.
 */
export function checkFlexibleAdEligibility(graphVersion?: string | null): {
  eligible: boolean
  graphVersion: string
  supportedObjectives: readonly string[]
  notes: string
  deprecationWarning: string
} {
  const version = resolveMetaGraphVersion(graphVersion)
  const vNum = Number.parseInt(version.replace(/^v/, ''), 10)

  // creative_asset_groups_spec requires v17+ but only documented as fully stable from v25
  const eligible = vNum >= 17

  return {
    eligible,
    graphVersion: version,
    supportedObjectives: FLEXIBLE_AD_SUPPORTED_OBJECTIVES,
    notes: eligible
      ? 'creative_asset_groups_spec disponível via API. '
        + 'Apenas OUTCOME_SALES e OUTCOME_APP_PROMOTION. '
        + 'Cada grupo: ≥1 image/video, ≤5 texts/text_type, mesmo CTA type em todos os grupos.'
      : `Graph ${version} não suporta creative_asset_groups_spec (requer ≥ v17).`,
    deprecationWarning:
      'Flexible Ad Format foi removido do Ads Manager UI em março/2026. '
      + 'A API continua funcional, mas a Meta pode deprecar o campo sem aviso prévio. '
      + 'Considere Advantage+ Creative (degrees_of_freedom_spec) como alternativa moderna.',
  }
}

/**
 * Builds the POST /ads body for a Flexible Ad Format ad.
 */
export function buildFlexibleAdGraphBody(input: CreateFlexibleAdInput): Record<string, unknown> {
  return {
    name: input.name,
    adset_id: input.adsetId,
    status: input.status ?? 'PAUSED',
    creative_asset_groups_spec: JSON.stringify(buildCreativeAssetGroupsSpec(input.groups)),
  }
}

/**
 * Reads creative_asset_groups_spec from an existing ad.
 */
export async function readFlexibleAdStructure(
  graph: MetaGraphFetch,
  adId: string,
  accessToken: string,
  graphVersion?: string | null,
): Promise<Record<string, unknown> | null> {
  const version = resolveMetaGraphVersion(graphVersion)
  const url = metaGraphUrl(version, `${adId}`, {
    fields: 'id,name,status,creative_asset_groups_spec',
    access_token: accessToken,
  })

  const response = await graph(url, { method: 'GET' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    throw new MetaAdsToolError(
      'FLEXIBLE_AD_READ_FAILED',
      `Falha ao ler creative_asset_groups_spec do ad ${adId}: ${JSON.stringify((body as any)?.error?.message ?? response.status)}`,
      response.status,
      { adId },
    )
  }

  const data = await response.json() as Record<string, unknown>
  return data
}

// ---------- Zod Schemas for tool handlers ----------

const flexibleAdAssetSchema = z.object({
  imageHash: z.string().optional().describe('image_hash já existente na ad account.'),
  videoId: z.string().optional().describe('video_id já existente na ad account.'),
  videoThumbnailHash: z.string().optional().describe('image_hash do thumbnail do vídeo.'),
  label: z.string().optional().describe('Label opcional para rastreamento.'),
}).refine(
  d => Boolean(d.imageHash) || Boolean(d.videoId),
  { message: 'Cada asset precisa de imageHash ou videoId.' },
)

const flexibleAdTextSchema = z.object({
  text: z.string().min(1).describe('Texto do asset (≤5 por text_type por grupo).'),
  textType: z.enum(['primary_text', 'headline', 'description']).describe('Tipo: primary_text, headline ou description.'),
  label: z.string().optional(),
})

const flexibleAdGroupSchema = z.object({
  assets: z.array(flexibleAdAssetSchema).min(1).describe('≥1 imagem ou vídeo por grupo.'),
  texts: z.array(flexibleAdTextSchema).min(1).describe('≥1 texto por grupo (máx 5/text_type).'),
  callToAction: z.object({
    type: z.string().min(1).describe('CTA type (LEARN_MORE, SHOP_NOW, etc). Mesmo tipo em todos os grupos.'),
    link: z.string().url().describe('URL de destino (https).'),
  }),
})

export const metaCheckFlexibleAdEligibilitySchema = z.object({
  tenantId: z.string().min(1).describe('UUID do tenant.'),
  adAccountId: z.string().optional().describe('Ad account ID (sem act_).'),
})

export const metaCreateFlexibleAdSchema = z.object({
  tenantId: z.string().min(1).describe('UUID do tenant.'),
  adAccountId: z.string().optional(),
  adsetId: z.string().min(1).describe('ID do adset (objetivo OUTCOME_SALES ou OUTCOME_APP_PROMOTION).'),
  name: z.string().min(1).describe('Nome do anúncio.'),
  status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
  groups: z.array(flexibleAdGroupSchema).min(1).max(10).describe(
    'Asset groups. ≥1 grupo, cada um com assets + textos + CTA.',
  ),
  dryRun: z.boolean().optional().default(true).describe('true=preview sem criar (padrão). false=executa.'),
  confirm: z.literal(true).optional().describe('Confirmação obrigatória para escrita real.'),
  confirmTenantId: z.string().optional().describe('Deve bater com tenantId.'),
})

export const metaGetFlexibleAdStructureSchema = z.object({
  tenantId: z.string().min(1).describe('UUID do tenant.'),
  adAccountId: z.string().optional(),
  adId: z.string().min(1).describe('ID do anúncio a ler.'),
})
