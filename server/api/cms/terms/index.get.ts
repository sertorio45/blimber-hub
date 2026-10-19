import type { CmsItem, CmsTerm } from '~/lib/cms/contracts'

import { cmsTermListQuerySchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'
import { listTerms } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTerm[]>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, cmsTermListQuerySchema)
  return { data: await listTerms(ctx, query) }
})
