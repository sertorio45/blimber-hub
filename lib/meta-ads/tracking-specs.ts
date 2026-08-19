/**
 * Official Meta Ad tracking_specs + conversion_domain.
 * Docs: Marketing API Tracking Specs; Offline Conversions (ad tracking_spec).
 * Graph write keys only: action.type, fb_pixel, dataset; Ad field conversion_domain.
 */

import { z } from 'zod'
import { actPath, metaGraphUrl, normalizeMetaAdAccountId, parseMetaGraphMajorVersion } from './graph'
import { MetaAdsToolError, type MetaGraphFetch } from './types'

export const META_TRACKING_ACTION_TYPES = [
  'offsite_conversion',
  'offline_conversion',
  'leadgen_quality_conversion',
] as const

/** @deprecated Use META_TRACKING_ACTION_TYPES (Graph action.type). */
export const META_AD_TRACKING_TYPES = META_TRACKING_ACTION_TYPES

export type MetaTrackingActionType = (typeof META_TRACKING_ACTION_TYPES)[number]
export type MetaAdTrackingType = MetaTrackingActionType

export type TrackingAssetsContext = {
  apiVersion: string
  accessToken: string
  adAccountId: string
  graph: MetaGraphFetch
  publicConfig?: { pixel_id?: string }
}

/** Graph tracking_specs object we POST (official keys only). */
export type MetaGraphTrackingSpec = {
  'action.type': MetaTrackingActionType
  fb_pixel?: string
  dataset?: string
}

export type CompiledAdTracking = {
  trackingSpecs: MetaGraphTrackingSpec[]
  conversionDomain: string | null
}

const ACTION_TYPE_SET = new Set<string>(META_TRACKING_ACTION_TYPES)

export const META_FRIENDLY_TRACKING_TYPES = ['website', 'offline', 'crm'] as const
export type MetaFriendlyTrackingType = (typeof META_FRIENDLY_TRACKING_TYPES)[number]

const FRIENDLY_TO_ACTION: Record<MetaFriendlyTrackingType, MetaTrackingActionType> = {
  website: 'offsite_conversion',
  offline: 'offline_conversion',
  crm: 'leadgen_quality_conversion',
}

const idLike = z.union([
  z.string().min(1),
  z.number(),
  z.array(z.union([z.string().min(1), z.number()])).min(1),
])

/** website→offsite_conversion+fb_pixel; offline→offline_conversion+dataset; crm→leadgen_quality_conversion. */
function normalizeFriendlyTrackingSpec(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return raw
  const o = { ...(raw as Record<string, unknown>) }
  const friendly = o.type
  if (friendly === 'website' || friendly === 'offline' || friendly === 'crm') {
    o.actionType = o.actionType ?? o['action.type'] ?? FRIENDLY_TO_ACTION[friendly]
    if (o.pixelId != null && o.fbPixel == null && o.fb_pixel == null)
      o.fbPixel = String(o.pixelId)
    if (o.datasetId != null && o.dataset == null)
      o.dataset = String(o.datasetId)
    delete o.type
    delete o.pixelId
    delete o.datasetId
  }
  return o
}

export const metaTrackingSpecInputSchema = z.preprocess(
  normalizeFriendlyTrackingSpec,
  z.object({
    actionType: z.enum(META_TRACKING_ACTION_TYPES).optional(),
    'action.type': z.enum(META_TRACKING_ACTION_TYPES).optional(),
    fbPixel: z.string().min(1).optional(),
    fb_pixel: idLike.optional(),
    dataset: idLike.optional(),
  })
    .strict()
    .superRefine((data, ctx) => {
      const action = data.actionType ?? data['action.type']
      if (!action) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'trackingSpecs: use type=website|offline|crm (Pixel/Dataset) ou actionType Graph '
            + '(offsite_conversion|offline_conversion|leadgen_quality_conversion).',
          path: ['actionType'],
        })
        return
      }
    const pixel = firstId(data.fbPixel ?? data.fb_pixel)
    const dataset = firstId(data.dataset)
    if (action === 'offsite_conversion' && !pixel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'offsite_conversion (site/Pixel) exige fb_pixel / fbPixel.',
        path: ['fbPixel'],
      })
    }
    if (action === 'offline_conversion' && !dataset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'offline_conversion exige dataset (Offline Event Set / Dataset id).',
        path: ['dataset'],
      })
    }
    if (action === 'leadgen_quality_conversion' && !pixel && !dataset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'leadgen_quality_conversion exige fb_pixel ou dataset (docs Tracking Specs).',
        path: ['fbPixel'],
      })
    }
    if (action === 'offsite_conversion' && dataset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'offsite_conversion não aceita dataset — use offline_conversion para Dataset offline.',
        path: ['dataset'],
      })
    }
    if (action === 'offline_conversion' && pixel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'offline_conversion não aceita fb_pixel — use type=website / offsite_conversion para Pixel.',
        path: ['fbPixel'],
      })
    }
    if (action === 'leadgen_quality_conversion' && pixel && dataset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'type=crm / leadgen_quality_conversion: Pixel XOR Dataset (não ambos no mesmo item).',
        path: ['dataset'],
      })
    }
    }),
)

export type MetaTrackingSpecInput = z.infer<typeof metaTrackingSpecInputSchema>

export const metaTrackingSpecsArraySchema = z
  .array(metaTrackingSpecInputSchema)
  .min(1)
  .max(20)

const conversionDomainSchema = z
  .string()
  .min(3)
  .max(253)
  .refine(isConversionDomain, {
    message: 'conversionDomain deve ser só o domínio (ex. exemplo.com), sem https:// nem path.',
  })

export const metaAdTrackingFieldsSchema = z.object({
  trackingSpecs: metaTrackingSpecsArraySchema
    .optional()
    .describe(
      'tracking_specs no Ad. Preferir type website|offline|crm (pixelId/datasetId). '
      + 'Ou actionType Graph (offsite_conversion|offline_conversion|leadgen_quality_conversion).',
    ),
  pixelId: z
    .string()
    .min(1)
    .optional()
    .describe('Atalho: Pixel → offsite_conversion + fb_pixel.'),
  offlineDatasetId: z
    .string()
    .min(1)
    .optional()
    .describe('Atalho: Dataset offline → offline_conversion + dataset.'),
  conversionDomain: conversionDomainSchema
    .optional()
    .describe('Graph conversion_domain (ex. exemplo.com).'),
})

export type MetaAdTrackingFields = z.infer<typeof metaAdTrackingFieldsSchema>

function firstId(value: unknown): string | null {
  if (value == null || value === '')
    return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first == null ? null : String(first).trim() || null
  }
  return String(value).trim() || null
}

export function isConversionDomain(raw: string): boolean {
  const value = String(raw || '').trim().toLowerCase()
  if (!value || value.includes('/') || value.includes(':') || value.includes(' '))
    return false
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)
}

function specIdentity(spec: MetaGraphTrackingSpec): string {
  return [
    spec['action.type'],
    spec.fb_pixel ? `pixel:${spec.fb_pixel}` : '',
    spec.dataset ? `dataset:${spec.dataset}` : '',
  ].filter(Boolean).join('|')
}

export function toGraphTrackingSpec(
  input: MetaTrackingSpecInput | Record<string, unknown>,
): MetaGraphTrackingSpec {
  const normalized = normalizeFriendlyTrackingSpec(input) as MetaTrackingSpecInput & Record<string, unknown>
  const action = (normalized.actionType ?? normalized['action.type']) as MetaTrackingActionType
  const spec: MetaGraphTrackingSpec = { 'action.type': action }
  const pixel = firstId(normalized.fbPixel ?? normalized.fb_pixel)
  const dataset = firstId(normalized.dataset)
  if (pixel)
    spec.fb_pixel = pixel
  if (dataset)
    spec.dataset = dataset
  return spec
}

export function buildGraphTrackingSpecs(
  specs: MetaTrackingSpecInput[] | MetaGraphTrackingSpec[],
): MetaGraphTrackingSpec[] {
  return specs.map((item) => {
    if (item && typeof item === 'object' && 'action.type' in item && !('actionType' in item) && !('fbPixel' in item))
      return item as MetaGraphTrackingSpec
    return toGraphTrackingSpec(item as MetaTrackingSpecInput)
  })
}

export function compileAdTracking(input: MetaAdTrackingFields): CompiledAdTracking {
  const specs: MetaGraphTrackingSpec[] = []
  const seen = new Set<string>()

  const push = (spec: MetaGraphTrackingSpec) => {
    const key = specIdentity(spec)
    if (seen.has(key))
      return
    seen.add(key)
    specs.push(spec)
  }

  if (input.trackingSpecs?.length) {
    for (const item of input.trackingSpecs)
      push(toGraphTrackingSpec(item))
  }

  if (input.pixelId) {
    const fromShortcut: MetaGraphTrackingSpec = {
      'action.type': 'offsite_conversion',
      fb_pixel: String(input.pixelId).trim(),
    }
    const existingPixel = specs.find(s => s['action.type'] === 'offsite_conversion' && s.fb_pixel)
    if (existingPixel && existingPixel.fb_pixel !== fromShortcut.fb_pixel) {
      throw new MetaAdsToolError(
        'TRACKING_SPEC_CONFLICT',
        'pixelId conflita com trackingSpecs offsite_conversion (fb_pixel diferente).',
        400,
        { pixelId: input.pixelId, fb_pixel: existingPixel.fb_pixel },
      )
    }
    push(fromShortcut)
  }

  if (input.offlineDatasetId) {
    const fromShortcut: MetaGraphTrackingSpec = {
      'action.type': 'offline_conversion',
      dataset: String(input.offlineDatasetId).trim(),
    }
    const existing = specs.find(s => s['action.type'] === 'offline_conversion' && s.dataset)
    if (existing && existing.dataset !== fromShortcut.dataset) {
      throw new MetaAdsToolError(
        'TRACKING_SPEC_CONFLICT',
        'offlineDatasetId conflita com trackingSpecs offline_conversion (dataset diferente).',
        400,
        { offlineDatasetId: input.offlineDatasetId, dataset: existing.dataset },
      )
    }
    push(fromShortcut)
  }

  const conversionDomain = input.conversionDomain
    ? String(input.conversionDomain).trim().toLowerCase()
    : null

  return { trackingSpecs: specs, conversionDomain }
}

export function hasAdTrackingInput(input: MetaAdTrackingFields): boolean {
  return Boolean(
    input.trackingSpecs?.length
    || input.pixelId
    || input.offlineDatasetId
    || input.conversionDomain,
  )
}

export function parseGraphTrackingSpecs(raw: unknown): unknown[] {
  if (!Array.isArray(raw))
    return []
  return raw.filter(item => item && typeof item === 'object')
}

function graphSpecActionType(raw: Record<string, unknown>): string | null {
  const value = raw['action.type'] ?? raw.action_type
  return firstId(value)
}

export function mergeTrackingSpecs(params: {
  existing: unknown
  incoming: MetaGraphTrackingSpec[]
  replace: boolean
}): unknown[] {
  if (params.replace)
    return params.incoming

  const existing = parseGraphTrackingSpecs(params.existing)
  const merged: unknown[] = [...existing]
  const existingKeys = new Set<string>()

  for (const item of existing) {
    const rec = item as Record<string, unknown>
    const action = graphSpecActionType(rec)
    if (!action || !ACTION_TYPE_SET.has(action))
      continue
    const spec: MetaGraphTrackingSpec = { 'action.type': action as MetaTrackingActionType }
    const pixel = firstId(rec.fb_pixel)
    const dataset = firstId(rec.dataset)
    if (pixel)
      spec.fb_pixel = pixel
    if (dataset)
      spec.dataset = dataset
    existingKeys.add(specIdentity(spec))
  }

  for (const spec of params.incoming) {
    if (existingKeys.has(specIdentity(spec)))
      continue
    merged.push(spec)
    existingKeys.add(specIdentity(spec))
  }

  return merged
}

export function applyTrackingToAdGraphBody(
  body: Record<string, unknown>,
  compiled: CompiledAdTracking,
  trackingSpecsOverride?: unknown[],
): Record<string, unknown> {
  const specs = trackingSpecsOverride ?? compiled.trackingSpecs
  if (specs.length)
    body.tracking_specs = specs
  if (compiled.conversionDomain)
    body.conversion_domain = compiled.conversionDomain
  return body
}

export function summarizeTrackingSpecs(
  specs: MetaTrackingSpecInput[] | MetaGraphTrackingSpec[] | unknown[],
): string[] {
  return (specs as Array<Record<string, unknown>>).map((spec) => {
    const action = firstId(spec['action.type']) || firstId(spec.actionType) || '?'
    const pixel = firstId(spec.fb_pixel ?? spec.fbPixel)
    const dataset = firstId(spec.dataset)
    const parts = [`action.type=${action}`]
    if (pixel)
      parts.push(`fb_pixel=${pixel}`)
    if (dataset)
      parts.push(`dataset=${dataset}`)
    return parts.join(' ')
  })
}

export function summarizeTrackingForPreview(
  compiled: CompiledAdTracking,
  specs?: unknown[],
): string[] {
  const list = specs ?? compiled.trackingSpecs
  const notes = summarizeTrackingSpecs(list as unknown[]).map(s => `tracking_specs: ${s}`)
  if (compiled.conversionDomain)
    notes.push(`conversion_domain: ${compiled.conversionDomain}`)
  return notes
}

export async function listAdAccountPixels(
  ctx: TrackingAssetsContext,
  options?: { limit?: number },
): Promise<Array<{ id: string, name: string | null }>> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const res = await ctx.graph(metaGraphUrl(ctx.apiVersion, `/${actPath(ctx.adAccountId)}/adspixels`), {
    query: {
      fields: 'id,name',
      limit,
      access_token: ctx.accessToken,
    },
  })
  return parseGraphDataRows(res)
}

/** Graph v20+ removed act_{id}/offline_conversion_data_sets; adspixels are consolidated Datasets. */
const LEGACY_OFFLINE_DATASETS_MAX_MAJOR = 19

function usesLegacyOfflineDatasetsEdge(apiVersion: string): boolean {
  return parseMetaGraphMajorVersion(apiVersion) <= LEGACY_OFFLINE_DATASETS_MAX_MAJOR
}

function parseGraphDataRows(res: Record<string, unknown> | null | undefined): Array<{ id: string, name: string | null }> {
  const rows = Array.isArray(res?.data) ? res.data : []
  return rows
    .map((row: Record<string, unknown>) => ({
      id: String(row.id || ''),
      name: row.name != null ? String(row.name) : null,
    }))
    .filter((row: { id: string }) => Boolean(row.id))
}

async function listLegacyOfflineConversionDataSets(
  ctx: TrackingAssetsContext,
  limit: number,
): Promise<Array<{ id: string, name: string | null }>> {
  const res = await ctx.graph(
    metaGraphUrl(ctx.apiVersion, `/${actPath(ctx.adAccountId)}/offline_conversion_data_sets`),
    {
      query: {
        fields: 'id,name',
        limit,
        access_token: ctx.accessToken,
      },
    },
  )
  return parseGraphDataRows(res)
}

async function listAdAccountPixelDatasets(
  ctx: TrackingAssetsContext,
  limit: number,
): Promise<Array<{ id: string, name: string | null }>> {
  const res = await ctx.graph(
    metaGraphUrl(ctx.apiVersion, `/${actPath(ctx.adAccountId)}/adspixels`),
    {
      query: {
        fields: 'id,name,is_consolidated_container',
        limit,
        access_token: ctx.accessToken,
      },
    },
  )
  return parseGraphDataRows(res)
}

async function resolveDatasetOwnerAdAccountId(
  ctx: TrackingAssetsContext,
  datasetId: string,
): Promise<string | null> {
  try {
    const res = await ctx.graph(
      metaGraphUrl(ctx.apiVersion, `/${datasetId}`),
      {
        query: {
          fields: 'id,owner_ad_account',
          access_token: ctx.accessToken,
        },
      },
    ) as Record<string, unknown> | null | undefined
    const owner = res?.owner_ad_account
    if (!owner)
      return null
    if (typeof owner === 'object' && owner !== null && 'id' in owner)
      return normalizeMetaAdAccountId(String((owner as { id: unknown }).id))
    return normalizeMetaAdAccountId(String(owner))
  }
  catch {
    return null
  }
}

export async function listAdAccountDatasets(
  ctx: TrackingAssetsContext,
  options?: { limit?: number },
): Promise<Array<{ id: string, name: string | null }>> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const byId = new Map<string, { id: string, name: string | null }>()

  const pixelDatasets = await listAdAccountPixelDatasets(ctx, limit)
  for (const row of pixelDatasets)
    byId.set(row.id, row)

  if (usesLegacyOfflineDatasetsEdge(ctx.apiVersion)) {
    try {
      const legacy = await listLegacyOfflineConversionDataSets(ctx, limit)
      for (const row of legacy)
        byId.set(row.id, row)
    }
    catch {
      // Legacy edge may be unavailable; adspixels remain the v20+ source of truth.
    }
  }

  return [...byId.values()]
}

export async function assertTrackingAssetsOwned(params: {
  graph: MetaGraphFetch
  creds: TrackingAssetsContext
  trackingSpecs: MetaGraphTrackingSpec[]
}): Promise<void> {
  await assertTrackingSpecsOwned(params.creds, params.trackingSpecs)
}

export async function assertTrackingSpecsOwned(
  ctx: TrackingAssetsContext,
  specs: MetaTrackingSpecInput[] | MetaGraphTrackingSpec[],
): Promise<void> {
  const graphSpecs = buildGraphTrackingSpecs(specs)
  const pixelIds = [...new Set(
    graphSpecs.map(s => s.fb_pixel).filter((id): id is string => Boolean(id)),
  )]
  const datasetIds = [...new Set(
    graphSpecs.map(s => s.dataset).filter((id): id is string => Boolean(id)),
  )]

  if (pixelIds.length) {
    const pixels = await listAdAccountPixels(ctx, { limit: 200 })
    const allowed = new Set(pixels.map(p => p.id))
    const integrationPixel = ctx.publicConfig?.pixel_id
      ? String(ctx.publicConfig.pixel_id).trim()
      : ''
    if (integrationPixel)
      allowed.add(integrationPixel)
    for (const pixelId of pixelIds) {
      if (!allowed.has(pixelId)) {
        throw new MetaAdsToolError(
          'PIXEL_TENANT_MISMATCH',
          'Pixel não pertence à ad account do tenant (GET act_*/adspixels) nem ao pixel_id da integração.',
          403,
          { pixelId },
        )
      }
    }
  }

  if (datasetIds.length) {
    const datasets = await listAdAccountDatasets(ctx, { limit: 200 })
    const allowed = new Set(datasets.map(d => d.id))
    const tenantAdAccountId = normalizeMetaAdAccountId(ctx.adAccountId)
    for (const datasetId of datasetIds) {
      if (allowed.has(datasetId))
        continue
      const ownerAdAccountId = await resolveDatasetOwnerAdAccountId(ctx, datasetId)
      if (ownerAdAccountId === tenantAdAccountId)
        continue
      throw new MetaAdsToolError(
        'DATASET_TENANT_MISMATCH',
        'Dataset offline não pertence à ad account do tenant (GET act_*/adspixels ou owner_ad_account do Dataset).',
        403,
        { datasetId },
      )
    }
  }
}
