import type { CmsDocumentPayload } from '~/lib/cms/contracts'
import type { CmsDocumentContext } from '~/server/utils/cms/context'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { assertNoDbError, cmsError } from '~/server/utils/cms/errors'

/**
 * Author and terms are stored inside the draft payload. They must already
 * belong to the document's site and tenant; publish repeats the term check.
 */
export async function assertDraftReferences(
  ctx: Pick<CmsDocumentContext, 'client' | 'tenantId' | 'site'>,
  payload: CmsDocumentPayload,
): Promise<string[]> {
  const termIds = [...new Set(payload.termIds ?? [])]

  if (payload.authorId) {
    const { data, error } = await ctx.client
      .from(CMS_TABLES.authors)
      .select('id')
      .eq('id', payload.authorId)
      .eq('tenant_id', ctx.tenantId)
      .eq('site_id', ctx.site.id)
      .maybeSingle()
    assertNoDbError(error, 'Erro ao validar o autor')
    if (!data)
      throw cmsError(422, 'validation_failed', 'Autor não encontrado neste site', { field: 'authorId', reason: 'unknown_author' })
  }

  if (!termIds.length)
    return termIds

  const { data, error } = await ctx.client
    .from(CMS_TABLES.terms)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', ctx.site.id)
    .in('id', termIds)
  assertNoDbError(error, 'Erro ao validar as categorias')

  const found = new Set(((data ?? []) as Array<{ id: string }>).map(row => row.id))
  if (termIds.some(id => !found.has(id)))
    throw cmsError(422, 'validation_failed', 'Uma das categorias ou tags não pertence a este site', { field: 'termIds', reason: 'unknown_term' })

  return termIds
}
