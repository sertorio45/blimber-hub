import type { CmsPage } from '~/lib/cms/contracts'
import type { MediaAssetWithPreview } from '~/server/utils/media/service'

import { getQuery } from 'h3'
import { z } from 'zod'

import { CMS_LIMITS } from '~/lib/cms/contracts'
import { cmsError, requireCmsMediaContext, withCmsErrors } from '~/server/utils/media/cms-adapter'
import { listAssets, MEDIA_KINDS } from '~/server/utils/media/service'

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(200).optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.defaultPageSize),
})

export default defineEventHandler(async (event): Promise<CmsPage<MediaAssetWithPreview>> => withCmsErrors(async () => {
  const ctx = await requireCmsMediaContext(event, 'read')

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success)
    throw cmsError(400, 'validation_failed', 'Parâmetros de busca inválidos', parsed.error.flatten())

  const { search, cursor, kind, limit } = parsed.data
  const result = await listAssets(ctx, {
    limit,
    paginate: true,
    cursor: cursor || null,
    search: search || null,
    kind: kind ?? null,
  })

  return { data: result.data, nextCursor: result.nextCursor }
}))
