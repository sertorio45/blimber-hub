import { readBody } from 'h3'
import { z } from 'zod'

import { requireMarketingMediaContext } from '~/server/utils/media/marketing-adapter'
import { previewAssetDeletion } from '~/server/utils/media/service'

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
})

export default defineEventHandler(async (event) => {
  const input = schema.parse(await readBody(event))
  const ctx = await requireMarketingMediaContext(event, 'read', input.tenant_id)

  const preview = await previewAssetDeletion(ctx, input.assetIds)

  return { data: preview }
})
