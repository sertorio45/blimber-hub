import type { CmsEntry, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { getCollectionEntry } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsEntry>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return {
    data: await getCollectionEntry(ctx, getRouterParam(event, 'id'), getRouterParam(event, 'entryId')),
  }
})
