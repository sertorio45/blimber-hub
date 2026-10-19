import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'
import { deleteRedirect } from '~/server/utils/cms/redirects'

export default defineCmsHandler(async (event): Promise<{ data: { id: string } }> => {
  const routeId = getRouterParam(event, 'routeId')
  const ctx = await requireCmsContext(event, 'cms.publish', { siteId: getRouterParam(event, 'id') })
  await deleteRedirect(ctx, routeId || '')
  return { data: { id: routeId || '' } }
})
