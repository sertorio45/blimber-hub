import type { CmsEntry, CmsPage } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsEntryListQuerySchema } from '~/lib/cms/contracts'
import { listCollectionEntries } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

/** Listing entries is `cms.read`. Creating or editing them is `cms.schemas.manage`. */
export default defineCmsHandler(async (event): Promise<CmsPage<CmsEntry>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, cmsEntryListQuerySchema)
  return listCollectionEntries(ctx, getRouterParam(event, 'id'), query)
})
