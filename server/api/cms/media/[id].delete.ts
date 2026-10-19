import type { CmsItem } from '~/lib/cms/contracts'
import type { DeleteMediaAssetResult, MediaAssetDeletePreviewItem } from '~/server/utils/media-asset-deletion'

import { getRouterParam, isError } from 'h3'
import { z } from 'zod'

import { cmsError, withCmsErrors } from '~/server/utils/cms/errors'
import { requireCmsMediaContext } from '~/server/utils/media/cms-adapter'
import { deleteAsset } from '~/server/utils/media/service'

/**
 * Mirrors the Marketing rule: an asset referenced by a social post or by any
 * `cms_asset_usages` row is never deleted (409 with the usages).
 */
export default defineEventHandler(async (event): Promise<CmsItem<DeleteMediaAssetResult>> => withCmsErrors(async () => {
  const ctx = await requireCmsMediaContext(event, 'delete')

  const assetId = getRouterParam(event, 'id')
  if (!z.string().uuid().safeParse(assetId).success)
    throw cmsError(404, 'not_found', 'Arquivo não encontrado')

  try {
    return { data: await deleteAsset(ctx, assetId!) }
  }
  catch (error: unknown) {
    if (isError(error) && error.statusCode === 409) {
      const blocked = ((error.data as { blocked?: MediaAssetDeletePreviewItem[] } | undefined)?.blocked) || []
      throw cmsError(409, 'asset_in_use', error.statusMessage || 'Arquivo em uso', {
        usages: blocked[0]?.usages ?? { socialPosts: [], cmsDocuments: [] },
      })
    }
    throw error
  }
}))
