import type { CmsItem } from '~/lib/cms/contracts'
import type { CmsOverview } from '~/server/utils/cms/documents'

import { requireCmsContext } from '~/server/utils/cms/context'
import { getOverview } from '~/server/utils/cms/documents'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsOverview>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await getOverview(ctx) }
})
