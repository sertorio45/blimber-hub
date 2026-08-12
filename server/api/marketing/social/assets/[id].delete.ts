import { getRouterParam } from 'h3'

import { deleteMediaAsset } from '~/server/utils/media-asset-deletion'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const assetId = String(getRouterParam(event, 'id'))
  const { client, tenantId, user } = await requireSocialContext(event, 'marketing.social.update')

  await deleteMediaAsset(event, client, tenantId, user.id, assetId)

  return { success: true }
})
