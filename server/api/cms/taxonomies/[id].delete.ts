import type { CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { deleteTaxonomy } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<{ id: string }>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await deleteTaxonomy(ctx, getRouterParam(event, 'id') ?? '') }
})
