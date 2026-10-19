import type { CmsItem, CmsRedirect } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsRedirectInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { upsertRedirect } from '~/server/utils/cms/redirects'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsRedirect>> => {
  const ctx = await requireCmsContext(event, 'cms.publish', { siteId: getRouterParam(event, 'id') })
  const input = await readCmsBody(event, cmsRedirectInputSchema)
  return { data: await upsertRedirect(ctx, input) }
})
