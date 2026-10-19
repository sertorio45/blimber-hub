import type { CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { deleteCollectionDefinition } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<{ id: string }>> => {
  const ctx = await requireCmsContext(event, 'cms.schemas.manage')
  return { data: await deleteCollectionDefinition(ctx, getRouterParam(event, 'id')) }
})
