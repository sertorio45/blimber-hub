import type { CmsItem, CmsSite } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateSiteInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { createSite } from '~/server/utils/cms/sites'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsSite>> => {
  const ctx = await requireCmsContext(event, 'cms.settings.manage')
  const input = await readCmsBody(event, cmsCreateSiteInputSchema)
  const site = await createSite(ctx, input)
  setResponseStatus(event, 201)
  return { data: site }
})
