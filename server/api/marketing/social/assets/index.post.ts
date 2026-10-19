import { readBody } from 'h3'
import { z } from 'zod'

import { LIBRARY_CATEGORIES } from '~/server/utils/media-library-upload'
import { requireMarketingMediaContext } from '~/server/utils/media/marketing-adapter'
import { registerUploadedAsset } from '~/server/utils/media/service'

const schema = z.object({
  tenant_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255),
  objectPath: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(150),
  sizeBytes: z.number().int().nonnegative().max(104857600),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  checksum: z.string().max(128).nullable().optional(),
  purpose: z.enum(['reference', 'publication']).default('reference'),
  category: z.enum(LIBRARY_CATEGORIES).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  const { tenant_id: requestedTenantId, ...input } = schema.parse(await readBody(event))
  const ctx = await requireMarketingMediaContext(event, 'upload', requestedTenantId ?? null)

  return {
    data: await registerUploadedAsset(ctx, input),
  }
})
