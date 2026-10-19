import type { CmsItem, CmsTaxonomy } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { getTaxonomy } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTaxonomy>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await getTaxonomy(ctx, getRouterParam(event, 'id') ?? '') }
})
