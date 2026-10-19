import type { CmsPage, CmsPublicationJob } from '~/lib/cms/contracts'

import { cmsJobListQuerySchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'
import { listPublicationJobs } from '~/server/utils/cms/publication-jobs'

export default defineCmsHandler(async (event): Promise<CmsPage<CmsPublicationJob>> => {
  const ctx = await requireCmsContext(event, 'cms.publish')
  return listPublicationJobs(ctx, readCmsQuery(event, cmsJobListQuerySchema))
})
