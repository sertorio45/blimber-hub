import type { CmsItem, CmsTaxonomy } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateTaxonomyInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { createTaxonomy } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTaxonomy>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsCreateTaxonomyInputSchema)
  const taxonomy = await createTaxonomy(ctx, input)
  setResponseStatus(event, 201)
  return { data: taxonomy }
})
