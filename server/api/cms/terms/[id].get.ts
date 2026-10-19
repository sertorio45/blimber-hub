import type { CmsItem, CmsTerm } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { getTerm } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTerm>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await getTerm(ctx, getRouterParam(event, 'id') ?? '') }
})
