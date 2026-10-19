import type { CmsDocument, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { mapDocument } from '~/server/utils/cms/mappers'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsDocument>> => {
  const ctx = await requireCmsContext(event, 'cms.read', { documentId: getRouterParam(event, 'id') })
  return { data: mapDocument(ctx.document) }
})
