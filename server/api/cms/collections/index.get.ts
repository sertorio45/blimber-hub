import type { CmsCollectionDefinition, CmsItem } from '~/lib/cms/contracts'

import { cmsCollectionListQuerySchema } from '~/lib/cms/contracts'
import { listCollectionDefinitions } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

/** Readers can list collections. Creating one requires `cms.schemas.manage`. */
export default defineCmsHandler(async (event): Promise<CmsItem<CmsCollectionDefinition[]>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, cmsCollectionListQuerySchema)
  return { data: await listCollectionDefinitions(ctx, query.siteId) }
})
