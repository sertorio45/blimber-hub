import type { CmsAuthor, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { getAuthor } from '~/server/utils/cms/authors'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsAuthor>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await getAuthor(ctx, getRouterParam(event, 'id') ?? '') }
})
