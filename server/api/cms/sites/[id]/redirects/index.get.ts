import type { CmsPage, CmsRedirect } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { listRedirects } from '~/server/utils/cms/redirects'

export default defineCmsHandler(async (event): Promise<CmsPage<CmsRedirect>> => {
  const ctx = await requireCmsContext(event, null, { siteId: getRouterParam(event, 'id') })
  return listRedirects(ctx)
})
