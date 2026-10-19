import { getRouterParam } from 'h3'

import { requireMarketingMediaContext } from '~/server/utils/media/marketing-adapter'
import { deleteAsset } from '~/server/utils/media/service'

export default defineEventHandler(async (event) => {
  const assetId = String(getRouterParam(event, 'id'))
  const ctx = await requireMarketingMediaContext(event, 'delete')

  await deleteAsset(ctx, assetId)

  return { success: true }
})
