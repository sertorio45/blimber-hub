import type { CmsItem, CmsSite } from '~/lib/cms/contracts'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { listSites } from '~/server/utils/cms/sites'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsSite[]>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await listSites(ctx) }
})
