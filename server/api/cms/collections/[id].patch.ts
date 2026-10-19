import type { CmsCollectionDefinition, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsUpdateCollectionInputSchema } from '~/lib/cms/contracts'
import { updateCollectionDefinition } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsCollectionDefinition>> => {
  const ctx = await requireCmsContext(event, 'cms.schemas.manage')
  const input = await readCmsBody(event, cmsUpdateCollectionInputSchema)
  return { data: await updateCollectionDefinition(ctx, getRouterParam(event, 'id'), input) }
})
