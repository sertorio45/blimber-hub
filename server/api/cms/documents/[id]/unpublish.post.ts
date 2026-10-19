import type { CmsDocument, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { unpublishDocument } from '~/server/utils/cms/documents'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsDocument>> => {
  const ctx = await requireCmsContext(event, 'cms.publish', { documentId: getRouterParam(event, 'id') })
  return { data: await unpublishDocument(ctx) }
})
