import type { CmsItem, CmsPublicationJob } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { cancelDocumentSchedule } from '~/server/utils/cms/publication-jobs'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsPublicationJob>> => {
  const ctx = await requireCmsContext(event, 'cms.publish', { documentId: getRouterParam(event, 'id') })
  return { data: await cancelDocumentSchedule(ctx) }
})
