import type { CmsAuthor, CmsItem } from '~/lib/cms/contracts'

import { cmsSiteQuerySchema } from '~/lib/cms/contracts'
import { listAuthors } from '~/server/utils/cms/authors'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsAuthor[]>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, cmsSiteQuerySchema)
  return { data: await listAuthors(ctx, query.siteId) }
})
