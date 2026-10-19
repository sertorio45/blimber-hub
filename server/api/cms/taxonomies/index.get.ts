import type { CmsItem, CmsTaxonomy } from '~/lib/cms/contracts'

import { cmsSiteQuerySchema, cmsTaxonomyKindSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'
import { listTaxonomies } from '~/server/utils/cms/taxonomies'

const querySchema = cmsSiteQuerySchema.extend({
  kind: cmsTaxonomyKindSchema.optional(),
})

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTaxonomy[]>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, querySchema)
  return { data: await listTaxonomies(ctx, query.siteId, query.kind) }
})
