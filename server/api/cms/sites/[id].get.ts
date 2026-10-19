import type { CmsItem, CmsSite } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { mapSite } from '~/server/utils/cms/mappers'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsSite>> => {
  const ctx = await requireCmsContext(event, 'cms.read', { siteId: getRouterParam(event, 'id') })
  return { data: mapSite(ctx.site) }
})
