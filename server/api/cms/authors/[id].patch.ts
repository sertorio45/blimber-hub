import type { CmsAuthor, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsUpdateAuthorInputSchema } from '~/lib/cms/contracts'
import { updateAuthor } from '~/server/utils/cms/authors'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsAuthor>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsUpdateAuthorInputSchema)
  return { data: await updateAuthor(ctx, getRouterParam(event, 'id') ?? '', input) }
})
