import type { CmsCollectionDefinition, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { loadCollectionDefinition } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsCollectionDefinition>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await loadCollectionDefinition(ctx, getRouterParam(event, 'id')) }
})
