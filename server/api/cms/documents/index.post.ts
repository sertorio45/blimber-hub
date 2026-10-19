import type { CmsDocument, CmsItem } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateDocumentInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { createDocument } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

/** The create capability depends on `kind` (pages vs publications), checked by the service. */
export default defineCmsHandler(async (event): Promise<CmsItem<CmsDocument>> => {
  const ctx = await requireCmsContext(event, null)
  const input = await readCmsBody(event, cmsCreateDocumentInputSchema)
  const document = await createDocument(ctx, input)
  setResponseStatus(event, 201)
  return { data: document }
})
