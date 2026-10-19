import type { CmsDocumentSummary, CmsPage } from '~/lib/cms/contracts'

import { cmsListQuerySchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { listDocuments } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsPage<CmsDocumentSummary>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const query = readCmsQuery(event, cmsListQuerySchema)
  return listDocuments(ctx, { ...query, type: undefined, kind: 'page' })
})
