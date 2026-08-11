/**
 * Platform domain: administrative tenant search (shared by Meta pack + unified MCP).
 */

import { z } from 'zod'
import { BlimberMcpError } from '../errors'
import type { BlimberMcpSupabaseLike } from '../types'

export const PLATFORM_TENANT_SEARCH_LIMIT_DEFAULT = 20
export const PLATFORM_TENANT_SEARCH_LIMIT_MAX = 50
export const PLATFORM_TENANT_SEARCH_MIN_CHARS = 2

export interface PlatformTenantMatch {
  id: string
  name: string
  slug: string
}

export function escapeIlikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export function buildTenantNameSearchPattern(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  return `%${escapeIlikePattern(trimmed)}%`
}

export function clampTenantSearchLimit(limit: number | undefined): number {
  if (limit === undefined)
    return PLATFORM_TENANT_SEARCH_LIMIT_DEFAULT
  return Math.min(
    PLATFORM_TENANT_SEARCH_LIMIT_MAX,
    Math.max(1, Math.trunc(limit)),
  )
}

export function normalizeTenantSearchQuery(raw: string | undefined): string | null {
  if (!raw)
    return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length < PLATFORM_TENANT_SEARCH_MIN_CHARS)
    return null
  return trimmed
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export const searchTenantsSchema = z.object({
  q: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  organizationId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).refine(data => Boolean(data.q || data.name), {
  message: 'Informe q ou name com pelo menos 2 caracteres',
})

export async function searchTenants(
  client: BlimberMcpSupabaseLike,
  rawArgs: unknown,
) {
  const args = searchTenantsSchema.parse(rawArgs)
  const search = normalizeTenantSearchQuery(args.q || args.name)
  if (!search) {
    throw new BlimberMcpError(
      'VALIDATION_ERROR',
      'Informe q (ou name) com pelo menos 2 caracteres para buscar o cliente',
      400,
    )
  }

  const limit = clampTenantSearchLimit(args.limit)
  const pattern = buildTenantNameSearchPattern(search)
  const quotedPattern = quotePostgrestValue(pattern)

  let scopedTenantIds: string[] | null = null

  if (args.organizationId) {
    const { data: links, error: linkError } = await client
      .from('organization_tenants')
      .select('tenant_id')
      .eq('organization_id', args.organizationId)
      .eq('is_active', true)

    if (linkError) {
      throw new BlimberMcpError('QUERY_ERROR', linkError.message, 400)
    }

    scopedTenantIds = (links || [])
      .map((row: { tenant_id: string }) => String(row.tenant_id))
      .filter(Boolean)

    if (!scopedTenantIds.length) {
      return {
        ok: true as const,
        query: search,
        organizationId: args.organizationId,
        tenants: [] as PlatformTenantMatch[],
      }
    }
  }

  let request = client
    .from('tenant')
    .select('id, name, slug')
    .or(`name.ilike.${quotedPattern},slug.ilike.${quotedPattern}`)
    .or('is_active.is.null,is_active.eq.true')
    .order('name')
    .limit(limit)

  if (scopedTenantIds)
    request = request.in('id', scopedTenantIds)

  const { data, error } = await request

  if (error)
    throw new BlimberMcpError('QUERY_ERROR', error.message, 400)

  const tenants: PlatformTenantMatch[] = (data || []).map((row: {
    id: string
    name: string
    slug: string
  }) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
  }))

  return {
    ok: true as const,
    query: search,
    ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    tenants,
  }
}
