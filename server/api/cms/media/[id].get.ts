import type { CmsItem } from '~/lib/cms/contracts'
import type { MediaAssetUsages } from '~/server/utils/media-asset-deletion'
import type { MediaAssetWithPreview } from '~/server/utils/media/service'

import { getRouterParam } from 'h3'
import { z } from 'zod'

import { cmsError, requireCmsMediaContext, withCmsErrors } from '~/server/utils/media/cms-adapter'
import { getAsset, getAssetUsages } from '~/server/utils/media/service'

type CmsMediaDetail = MediaAssetWithPreview & { usages: MediaAssetUsages }

export default defineEventHandler(async (event): Promise<CmsItem<CmsMediaDetail>> => withCmsErrors(async () => {
  const ctx = await requireCmsMediaContext(event, 'read')

  const assetId = getRouterParam(event, 'id')
  if (!z.string().uuid().safeParse(assetId).success)
    throw cmsError(404, 'not_found', 'Arquivo não encontrado')

  const asset = await getAsset(ctx, assetId!)
  const usages = await getAssetUsages(ctx, asset.id)

  return { data: { ...asset, usages } }
}))
