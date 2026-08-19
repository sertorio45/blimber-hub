import {
  actPath,
  enrichMetaGraphWriteError,
  metaGraphUrl,
  normalizeMetaAdAccountId,
} from './graph'
import type { MetaGraphFetch } from './types'
import { MetaAdsToolError } from './types'
import { assertAdAccountOwnership } from './write-guards'

/** Fields supported on AdSet node (Graph Marketing API v25). */
export const META_ADSET_DETAIL_FIELDS = [
  'id',
  'name',
  'account_id',
  'campaign_id',
  'status',
  'effective_status',
  'configured_status',
  'targeting',
  'targeting_automation',
  'promoted_object',
  'destination_type',
  'optimization_goal',
  'billing_event',
  'bid_strategy',
  'bid_amount',
  'bid_constraints',
  'daily_budget',
  'lifetime_budget',
  'start_time',
  'end_time',
  'attribution_spec',
  'is_dynamic_creative',
  'frequency_control_specs',
  'pacing_type',
  'adset_schedule',
  'optimization_sub_event',
  'existing_customer_budget_percentage',
  'daily_min_spend_target',
  'daily_spend_cap',
  'lifetime_min_spend_target',
  'lifetime_spend_cap',
  'campaign_attribution',
  'is_incremental_attribution_enabled',
].join(',')

export const META_ADSET_LIST_SUMMARY_FIELDS
  = 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event'

export const META_ADSET_LIST_FULL_FIELDS = [
  META_ADSET_LIST_SUMMARY_FIELDS,
  'targeting',
  'promoted_object',
  'destination_type',
  'attribution_spec',
  'bid_strategy',
  'start_time',
  'end_time',
].join(',')

const PLACEMENT_TARGETING_KEYS = [
  'publisher_platforms',
  'facebook_positions',
  'instagram_positions',
  'messenger_positions',
  'audience_network_positions',
  'device_platforms',
] as const

export type MetaAdsetPlacements = Partial<Record<(typeof PLACEMENT_TARGETING_KEYS)[number], unknown>>

/** Extract placement fields from adset targeting when present. */
export function extractPlacementsFromTargeting(
  targeting: unknown,
): MetaAdsetPlacements | null {
  if (!targeting || typeof targeting !== 'object')
    return null

  const source = targeting as Record<string, unknown>
  const placements: MetaAdsetPlacements = {}
  let found = false

  for (const key of PLACEMENT_TARGETING_KEYS) {
    if (source[key] !== undefined && source[key] !== null) {
      placements[key] = source[key]
      found = true
    }
  }

  return found ? placements : null
}

/** Enrich adset payload with extracted placements (non-destructive). */
export function enrichAdsetWithPlacements(adset: Record<string, unknown>): Record<string, unknown> {
  const placements = extractPlacementsFromTargeting(adset.targeting)
  if (!placements)
    return adset
  return { ...adset, placements }
}

const ADSET_READ_ONLY_FIELDS = new Set([
  'id',
  'account_id',
  'created_time',
  'updated_time',
  'effective_status',
  'configured_status',
  'issues_info',
  'recommendations',
  'source_adset',
  'source_adset_id',
  'campaign',
  'budget_remaining',
  'review_feedback',
  'learning_stage_info',
  'last_budget_toggling_time',
  'placements',
])

/**
 * Strip read-only Graph fields before POST /act_{id}/adsets (fallback copy path).
 * Preserves targeting, geo, age, gender, audiences, exclusions, placements, optimization, etc.
 */
export function sanitizeAdsetForCreate(adset: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(adset)) {
    if (ADSET_READ_ONLY_FIELDS.has(key))
      continue
    if (value === undefined || value === null)
      continue
    body[key] = value
  }
  return body
}

export function buildCopyAdsetGraphBody(params: {
  status: 'ACTIVE' | 'PAUSED'
  campaignId?: string
  deepCopy?: boolean
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    status_option: params.status,
    deep_copy: params.deepCopy ?? false,
  }
  if (params.campaignId)
    body.campaign_id = params.campaignId
  return body
}

export function buildAdsetCreateBodyFromSource(params: {
  source: Record<string, unknown>
  name: string
  campaignId: string
  status: 'ACTIVE' | 'PAUSED'
  dailyBudget?: number
  lifetimeBudget?: number
}): Record<string, unknown> {
  const sanitized = sanitizeAdsetForCreate(params.source)
  const body: Record<string, unknown> = {
    ...sanitized,
    name: params.name,
    campaign_id: params.campaignId,
    status: params.status,
  }

  if (params.dailyBudget != null) {
    body.daily_budget = params.dailyBudget
    delete body.lifetime_budget
  }
  else if (params.lifetimeBudget != null) {
    body.lifetime_budget = params.lifetimeBudget
    delete body.daily_budget
  }

  return body
}

export function isAdsetCopyEndpointUnsupported(error: unknown): boolean {
  if (!(error instanceof MetaAdsToolError) || error.code !== 'META_GRAPH_ERROR')
    return false

  const details = (error.details && typeof error.details === 'object')
    ? error.details as Record<string, unknown>
    : {}

  const message = String(details.message || error.message || '').toLowerCase()
  const code = details.code != null ? Number(details.code) : null

  if (message.includes('/copies') && (message.includes('unsupported') || message.includes('not supported')))
    return true
  if (code === 100 && (message.includes('copies') || message.includes('unknown path')))
    return true
  if (code === 3 && message.includes('capability'))
    return true

  return false
}

export async function fetchOwnedAdset(
  graph: MetaGraphFetch,
  params: {
    apiVersion: string
    accessToken: string
    adsetId: string
    tenantAdAccountId: string
    fields?: string
  },
): Promise<Record<string, unknown>> {
  const adset = await graph(metaGraphUrl(params.apiVersion, `/${params.adsetId}`), {
    query: {
      fields: params.fields ?? META_ADSET_DETAIL_FIELDS,
      access_token: params.accessToken,
    },
  })

  assertAdAccountOwnership({
    objectAccountId: adset?.account_id as string | undefined,
    tenantAdAccountId: params.tenantAdAccountId,
    code: 'ADSET_TENANT_MISMATCH',
    message: 'Adset não pertence à ad account do tenant.',
  })

  return (adset && typeof adset === 'object')
    ? adset as Record<string, unknown>
    : {}
}

export async function assertCampaignOwnedByAdAccount(
  graph: MetaGraphFetch,
  params: {
    apiVersion: string
    accessToken: string
    campaignId: string
    tenantAdAccountId: string
  },
): Promise<Record<string, unknown>> {
  const campaign = await graph(metaGraphUrl(params.apiVersion, `/${params.campaignId}`), {
    query: {
      fields: 'id,name,account_id,status',
      access_token: params.accessToken,
    },
  })

  assertAdAccountOwnership({
    objectAccountId: campaign?.account_id as string | undefined,
    tenantAdAccountId: params.tenantAdAccountId,
    code: 'CAMPAIGN_TENANT_MISMATCH',
    message: 'Campanha não pertence à ad account do tenant.',
  })

  return (campaign && typeof campaign === 'object')
    ? campaign as Record<string, unknown>
    : {}
}

export async function copyAdsetViaGraph(
  graph: MetaGraphFetch,
  params: {
    apiVersion: string
    accessToken: string
    sourceAdsetId: string
    copyBody: Record<string, unknown>
  },
): Promise<string> {
  try {
    const res = await graph(metaGraphUrl(params.apiVersion, `/${params.sourceAdsetId}/copies`), {
      method: 'POST',
      query: { access_token: params.accessToken },
      body: params.copyBody,
    })
    const copied = (res as Record<string, unknown>)?.copied_adset_id ?? (res as Record<string, unknown>)?.id
    if (!copied) {
      throw new MetaAdsToolError(
        'META_COPY_ADSET_FAILED',
        'Meta não retornou copied_adset_id ao duplicar o adset.',
        502,
        { response: res, request_payload: params.copyBody },
      )
    }
    return String(copied)
  }
  catch (err) {
    if (err instanceof MetaAdsToolError)
      throw err
    enrichMetaGraphWriteError(err, params.copyBody)
  }
}

export async function createAdsetFromSource(
  graph: MetaGraphFetch,
  params: {
    apiVersion: string
    accessToken: string
    adAccountId: string
    createBody: Record<string, unknown>
  },
): Promise<string> {
  try {
    const res = await graph(metaGraphUrl(params.apiVersion, `/${actPath(params.adAccountId)}/adsets`), {
      method: 'POST',
      query: { access_token: params.accessToken },
      body: params.createBody,
    })
    const id = (res as Record<string, unknown>)?.id
    if (!id) {
      throw new MetaAdsToolError(
        'META_COPY_ADSET_FAILED',
        'Meta não retornou id ao recriar o adset (fallback).',
        502,
        { response: res, request_payload: params.createBody },
      )
    }
    return String(id)
  }
  catch (err) {
    if (err instanceof MetaAdsToolError)
      throw err
    enrichMetaGraphWriteError(err, params.createBody)
  }
}

export async function patchAdsetFields(
  graph: MetaGraphFetch,
  params: {
    apiVersion: string
    accessToken: string
    adsetId: string
    body: Record<string, unknown>
  },
): Promise<void> {
  if (Object.keys(params.body).length === 0)
    return

  try {
    await graph(metaGraphUrl(params.apiVersion, `/${params.adsetId}`), {
      method: 'POST',
      query: { access_token: params.accessToken },
      body: params.body,
    })
  }
  catch (err) {
    enrichMetaGraphWriteError(err, params.body)
  }
}

export function parseAdsetBudgetCents(value: unknown): number | null {
  if (value == null || value === '')
    return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1)
    return null
  return Math.trunc(n)
}

export function adAccountIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b)
    return false
  return normalizeMetaAdAccountId(a) === normalizeMetaAdAccountId(b)
}
