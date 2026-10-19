import type { CmsItem } from '~/lib/cms/contracts'
import type { CmsPublishResult } from '~/server/utils/cms/documents'

import { getRouterParam } from 'h3'

import { cmsPublishInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { publishDocument } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsPublishResult>> => {
  const ctx = await requireCmsContext(event, 'cms.publish', { documentId: getRouterParam(event, 'id') })
  const input = await readCmsBody(event, cmsPublishInputSchema)
  return { data: await publishDocument(ctx, input) }
})
