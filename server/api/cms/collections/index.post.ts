import type { CmsCollectionDefinition, CmsItem } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateCollectionInputSchema } from '~/lib/cms/contracts'
import { createCollectionDefinition } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsCollectionDefinition>> => {
  const ctx = await requireCmsContext(event, 'cms.schemas.manage')
  const input = await readCmsBody(event, cmsCreateCollectionInputSchema)
  const definition = await createCollectionDefinition(ctx, input)
  setResponseStatus(event, 201)
  return { data: definition }
})
