import type { CmsItem, CmsTerm } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsUpdateTermInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { updateTerm } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTerm>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsUpdateTermInputSchema)
  return { data: await updateTerm(ctx, getRouterParam(event, 'id') ?? '', input) }
})
