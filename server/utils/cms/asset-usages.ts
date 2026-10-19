import type { CmsMediaRef } from '~/lib/cms/contracts'
import type { CmsDocumentContext } from '~/server/utils/cms/context'

import { CMS_TABLES } from '~/lib/cms/contracts'
import { assertNoDbError, cmsError } from '~/server/utils/cms/errors'

/** Draft cover is the only asset link the publications editor writes. */
export const CMS_COVER_FIELD_PATH = 'cover'

const MEDIA_ASSETS = 'media_assets'

/**
 * Confirms the cover belongs to this tenant and rewrites `objectPath` from the
 * stored asset, so a client cannot point the draft at another company's file.
 * `undefined` means the payload omitted the field and the current link stays.
 */
export async function resolveDraftCover(
  ctx: Pick<CmsDocumentContext, 'client' | 'tenantId'>,
  cover: CmsMediaRef | null | undefined,
): Promise<CmsMediaRef | null | undefined> {
  if (cover === undefined)
    return undefined
  if (cover === null)
    return null

  const { data, error } = await ctx.client
    .from(MEDIA_ASSETS)
    .select('id, object_path')
    .eq('id', cover.assetId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  assertNoDbError(error, 'Erro ao validar a capa')
  if (!data)
    throw cmsError(422, 'validation_failed', 'A imagem de capa não foi encontrada nesta empresa', { field: 'cover', reason: 'unknown_asset' })

  const objectPath = typeof data.object_path === 'string' ? data.object_path.trim() : ''
  return {
    assetId: cover.assetId,
    ...(objectPath ? { objectPath } : {}),
    ...(cover.alt ? { alt: cover.alt } : {}),
    ...(cover.credit ? { credit: cover.credit } : {}),
  }
}

/**
 * Replaces the draft cover usage for one document. Published revision rows are
 * left intact; only `usage_kind = draft` and `field_path = cover` are rewritten.
 */
export async function syncDraftCoverUsage(
  ctx: Pick<CmsDocumentContext, 'client' | 'tenantId' | 'site' | 'document'>,
  cover: CmsMediaRef | null,
): Promise<void> {
  const { error: deleteError } = await ctx.client
    .from(CMS_TABLES.assetUsages)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('site_id', ctx.site.id)
    .eq('document_id', ctx.document.id)
    .eq('usage_kind', 'draft')
    .eq('field_path', CMS_COVER_FIELD_PATH)
    .is('revision_id', null)
  assertNoDbError(deleteError, 'Erro ao atualizar o uso da capa')

  if (!cover)
    return

  const { error: insertError } = await ctx.client
    .from(CMS_TABLES.assetUsages)
    .insert({
      tenant_id: ctx.tenantId,
      site_id: ctx.site.id,
      asset_id: cover.assetId,
      document_id: ctx.document.id,
      revision_id: null,
      usage_kind: 'draft',
      field_path: CMS_COVER_FIELD_PATH,
    })
  assertNoDbError(insertError, 'Erro ao vincular a capa')
}
