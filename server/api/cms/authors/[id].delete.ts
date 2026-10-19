import type { CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { deleteAuthor } from '~/server/utils/cms/authors'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<{ id: string }>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  return { data: await deleteAuthor(ctx, getRouterParam(event, 'id') ?? '') }
})
