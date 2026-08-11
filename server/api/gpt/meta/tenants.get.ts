import { createError, defineEventHandler } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import {
  optionalInt,
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'
import { assertMetaGptApiKey } from '~/server/utils/meta-gpt-auth'
import {
  buildTenantNameSearchPattern,
  clampTenantSearchLimit,
  normalizeTenantSearchQuery,
  type MetaGptTenantMatch,
} from '~/server/utils/meta-gpt-tenants'

/** Quote a PostgREST filter value so commas / % / spaces stay inside one token. */
function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Administrative tenant search for Custom GPT.
 * Auth: global Bearer BLIMBER_MCP_API_KEY (same as other /api/gpt/meta/*).
 * Returns only id/name/slug — never integration tokens.
 *
 * Optional organizationId scopes matches to organization_tenants (agency portfolio).
 */
export default defineEventHandler(async (event) => {
  assertMetaGptApiKey(event)

  const q = queryRecord(event)
  const rawQuery = optionalString(q.q) || optionalString(q.name)
  const search = normalizeTenantSearchQuery(rawQuery)

  if (!search) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe q (ou name) com pelo menos 2 caracteres para buscar o cliente',
    })
  }

  const organizationId = optionalString(q.organizationId)
  const limit = clampTenantSearchLimit(optionalInt(q.limit))
  const pattern = buildTenantNameSearchPattern(search)
  const quotedPattern = quotePostgrestValue(pattern)
  const client = await serverSupabaseServiceRole(event)

  let scopedTenantIds: string[] | null = null

  if (organizationId) {
    const { data: links, error: linkError } = await client
      .from('organization_tenants')
      .select('tenant_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    if (linkError) {
      throw createError({
        statusCode: 400,
        statusMessage: linkError.message,
      })
    }

    scopedTenantIds = (links || [])
      .map(row => String(row.tenant_id))
      .filter(Boolean)

    if (!scopedTenantIds.length) {
      return {
        ok: true as const,
        query: search,
        organizationId,
        tenants: [] as MetaGptTenantMatch[],
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

  if (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message,
    })
  }

  const tenants: MetaGptTenantMatch[] = (data || []).map(row => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
  }))

  return {
    ok: true as const,
    query: search,
    ...(organizationId ? { organizationId } : {}),
    tenants,
  }
})
