import type { CmsItem, CmsTaxonomy } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsUpdateTaxonomyInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { updateTaxonomy } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTaxonomy>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsUpdateTaxonomyInputSchema)
  return { data: await updateTaxonomy(ctx, getRouterParam(event, 'id') ?? '', input) }
})
