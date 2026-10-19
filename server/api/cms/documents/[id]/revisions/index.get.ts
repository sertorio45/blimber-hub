import type { CmsPage } from '~/lib/cms/contracts'
import type { CmsRevisionSummary } from '~/server/utils/cms/mappers'

import { getRouterParam } from 'h3'
import { z } from 'zod'

import { CMS_LIMITS } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { listRevisions } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

const querySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_LIMITS.maxPageSize).default(CMS_LIMITS.defaultPageSize),
})

export default defineCmsHandler(async (event): Promise<CmsPage<CmsRevisionSummary>> => {
  const ctx = await requireCmsContext(event, 'cms.read', { documentId: getRouterParam(event, 'id') })
  const query = readCmsQuery(event, querySchema)
  return listRevisions(ctx, { cursor: query.cursor || null, limit: query.limit })
})
