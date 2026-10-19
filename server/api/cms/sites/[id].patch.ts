import type { CmsItem, CmsSite } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsUpdateSiteInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { updateSite } from '~/server/utils/cms/sites'

/** Site settings can hold route prefixes and theme data, hence the larger body ceiling. */
const SITE_BODY_BYTES = 64 * 1024

export default defineCmsHandler(async (event): Promise<CmsItem<CmsSite>> => {
  const ctx = await requireCmsContext(event, 'cms.settings.manage', { siteId: getRouterParam(event, 'id') })
  const input = await readCmsBody(event, cmsUpdateSiteInputSchema, SITE_BODY_BYTES)
  return { data: await updateSite(ctx, input) }
})
