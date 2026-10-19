import type { CmsItem, CmsPublicationJob } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsScheduleInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { scheduleDocument } from '~/server/utils/cms/publication-jobs'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsPublicationJob>> => {
  const ctx = await requireCmsContext(event, 'cms.publish', { documentId: getRouterParam(event, 'id') })
  const input = await readCmsBody(event, cmsScheduleInputSchema)
  return { data: await scheduleDocument(ctx, input) }
})
