import { readBody } from 'h3'
import { z } from 'zod'

import { deleteMediaAssetsBulk } from '~/server/utils/media-asset-deletion'
import { requireSocialContext } from '~/server/utils/social-context'

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
})

export default defineEventHandler(async (event) => {
  const input = schema.parse(await readBody(event))
  const { client, tenantId, user } = await requireSocialContext(
    event,
    'marketing.social.update',
    input.tenant_id,
  )

  const result = await deleteMediaAssetsBulk(
    event,
    client,
    tenantId,
    user.id,
    input.assetIds,
  )

  return {
    success: true,
    data: result,
  }
})
