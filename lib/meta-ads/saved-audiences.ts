/**
 * Meta Saved Audiences — targeting specs saved in Ads Manager for reuse.
 * List via GET /act_{id}/saved_audiences; resolve targeting for adset create/update.
 * Official API does not accept saved_audience_id on POST /adsets — we fetch targeting
 * and pass it through unchanged (no recreation via custom targeting schema).
 */

import type { MetaGraphFetch, ResolvedMetaCredentials } from './types'
import { z } from 'zod'
import { actPath, metaGraphUrl } from './graph'
import {
  META_ADVANTAGE_AUDIENCE_DEFAULT,
  type MetaAdvantageAudience,
  withAdvantageAudience,
  type MetaGraphTargeting,
} from './targeting-templates'
import { MetaAdsToolError } from './types'
import { assertAdAccountOwnership } from './write-guards'

export const META_SAVED_AUDIENCE_LIST_FIELDS
  = 'id,name,description,targeting,approximate_count_lower_bound,approximate_count_upper_bound,run_status,sentence_lines,time_created,time_updated'

export const META_SAVED_AUDIENCE_DETAIL_FIELDS
  = `${META_SAVED_AUDIENCE_LIST_FIELDS},permission_for_actions`

export interface MetaSavedAudienceRow {
  id: string
  name: string
  description: string | null
  targeting: Record<string, unknown> | null
  approximate_count_lower_bound: number | null
  approximate_count_upper_bound: number | null
  run_status: string | null
  sentence_lines: unknown
  time_created: string | null
  time_updated: string | null
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value)))
    return null
  return Number(value)
}

export function mapSavedAudienceRow(row: Record<string, unknown>): MetaSavedAudienceRow {
  return {
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    description: row.description != null ? String(row.description) : null,
    targeting: row.targeting && typeof row.targeting === 'object'
      ? (row.targeting as Record<string, unknown>)
      : null,
    approximate_count_lower_bound: toOptionalNumber(row.approximate_count_lower_bound),
    approximate_count_upper_bound: toOptionalNumber(row.approximate_count_upper_bound),
    run_status: row.run_status != null ? String(row.run_status) : null,
    sentence_lines: row.sentence_lines ?? null,
    time_created: row.time_created != null ? String(row.time_created) : null,
    time_updated: row.time_updated != null ? String(row.time_updated) : null,
  }
}

function normalizeAudienceName(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR')
}

export function filterSavedAudiencesByName(
  rows: MetaSavedAudienceRow[],
  options: { name?: string | null, nameContains?: string | null },
): MetaSavedAudienceRow[] {
  const exact = options.name?.trim()
  const contains = options.nameContains?.trim()
  let next = rows
  if (exact) {
    const needle = normalizeAudienceName(exact)
    next = next.filter(row => normalizeAudienceName(row.name) === needle)
  }
  if (contains) {
    const needle = normalizeAudienceName(contains)
    next = next.filter(row => normalizeAudienceName(row.name).includes(needle))
  }
  return next
}

/**
 * Shared refine: exactly one of targetingTemplate | targeting | savedAudienceId.
 */
export function refineTargetingSourceXor(
  data: {
    targetingTemplate?: string | null
    targeting?: unknown
    savedAudienceId?: string | null
  },
  ctx: z.RefinementCtx,
): void {
  const hasTemplate = data.targetingTemplate != null && data.targetingTemplate !== ''
  const hasCustom = data.targeting != null
  const hasSaved = data.savedAudienceId != null && String(data.savedAudienceId).trim() !== ''
  const count = [hasTemplate, hasCustom, hasSaved].filter(Boolean).length

  if (count > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe apenas um de: targetingTemplate, targeting ou savedAudienceId.',
      path: ['savedAudienceId'],
    })
  }
  if (count === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe targetingTemplate (BR_*), targeting (custom) ou savedAudienceId (público salvo).',
      path: ['targetingTemplate'],
    })
  }
}

async function assertSavedAudienceOnAdAccount(
  graph: MetaGraphFetch,
  creds: ResolvedMetaCredentials,
  savedAudienceId: string,
): Promise<void> {
  const res = await graph(
    metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/saved_audiences`),
    {
      query: {
        fields: 'id',
        limit: 1,
        filtering: JSON.stringify([{
          field: 'id',
          operator: 'IN',
          value: [savedAudienceId],
        }]),
        access_token: creds.accessToken,
      },
    },
  )
  const rows = Array.isArray(res?.data) ? res.data : []
  const found = rows.some((row: Record<string, unknown>) => String(row.id || '') === savedAudienceId)
  if (!found) {
    throw new MetaAdsToolError(
      'META_SAVED_AUDIENCE_TENANT_MISMATCH',
      'Público salvo não pertence à ad account do tenant.',
      403,
      { savedAudienceId, adAccountId: creds.adAccountId },
    )
  }
}

/**
 * Load a saved audience by id, verify it belongs to the tenant ad account,
 * and return Graph targeting unchanged (plus advantage_audience injection).
 */
export async function resolveSavedAudienceTargeting(params: {
  graph: MetaGraphFetch
  creds: ResolvedMetaCredentials
  savedAudienceId: string
  advantageAudience?: MetaAdvantageAudience | 0 | 1
}): Promise<{
  savedAudience: MetaSavedAudienceRow
  targeting: MetaGraphTargeting
  summary: string
  advantageAudience: MetaAdvantageAudience
}> {
  const savedAudienceId = String(params.savedAudienceId || '').trim()
  if (!savedAudienceId) {
    throw new MetaAdsToolError(
      'META_SAVED_AUDIENCE_ID_REQUIRED',
      'savedAudienceId é obrigatório.',
      400,
    )
  }

  await assertSavedAudienceOnAdAccount(params.graph, params.creds, savedAudienceId)

  const raw = await params.graph(metaGraphUrl(params.creds.apiVersion, `/${savedAudienceId}`), {
    query: {
      fields: META_SAVED_AUDIENCE_DETAIL_FIELDS,
      access_token: params.creds.accessToken,
    },
  })

  // Some Graph responses still expose account_id — use it when present.
  if (raw?.account_id != null) {
    assertAdAccountOwnership({
      objectAccountId: String(raw.account_id),
      tenantAdAccountId: params.creds.adAccountId,
      code: 'META_SAVED_AUDIENCE_TENANT_MISMATCH',
      message: 'Público salvo não pertence à ad account do tenant.',
    })
  }

  const savedAudience = mapSavedAudienceRow((raw || {}) as Record<string, unknown>)
  if (!savedAudience.id) {
    throw new MetaAdsToolError(
      'META_SAVED_AUDIENCE_NOT_FOUND',
      'Público salvo não encontrado.',
      404,
      { savedAudienceId },
    )
  }
  if (!savedAudience.targeting || typeof savedAudience.targeting !== 'object') {
    throw new MetaAdsToolError(
      'META_SAVED_AUDIENCE_EMPTY_TARGETING',
      `O público salvo "${savedAudience.name}" não tem segmentação (targeting) utilizável.`,
      409,
      { savedAudienceId, name: savedAudience.name },
    )
  }

  const runStatus = String(savedAudience.run_status || '').toUpperCase()
  if (runStatus && runStatus !== 'ACTIVE' && runStatus !== 'NORMAL') {
    throw new MetaAdsToolError(
      'META_SAVED_AUDIENCE_INACTIVE',
      `O público salvo "${savedAudience.name}" não está ativo (run_status=${savedAudience.run_status}).`,
      409,
      { savedAudienceId, run_status: savedAudience.run_status },
    )
  }

  const advantageAudience: MetaAdvantageAudience
    = params.advantageAudience === 1 ? 1 : META_ADVANTAGE_AUDIENCE_DEFAULT

  // Preserve the saved targeting object; only ensure Advantage+ flag required by Graph v23+.
  const targeting = withAdvantageAudience(
    savedAudience.targeting as MetaGraphTargeting,
    advantageAudience,
  )

  return {
    savedAudience,
    targeting,
    summary: `savedAudienceId=${savedAudience.id} (${savedAudience.name})`,
    advantageAudience,
  }
}

export async function listSavedAudiencesFromGraph(params: {
  graph: MetaGraphFetch
  creds: ResolvedMetaCredentials
  limit?: number
}): Promise<{ savedAudiences: MetaSavedAudienceRow[], paging: unknown }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const res = await params.graph(
    metaGraphUrl(params.creds.apiVersion, `/${actPath(params.creds.adAccountId)}/saved_audiences`),
    {
      query: {
        fields: META_SAVED_AUDIENCE_LIST_FIELDS,
        limit,
        access_token: params.creds.accessToken,
      },
    },
  )

  const savedAudiences = (Array.isArray(res?.data) ? res.data : [])
    .map((row: Record<string, unknown>) => mapSavedAudienceRow(row))
    .filter((row: MetaSavedAudienceRow) => Boolean(row.id))

  return {
    savedAudiences,
    paging: res?.paging || null,
  }
}
