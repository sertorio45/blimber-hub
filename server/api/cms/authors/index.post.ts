import type { CmsAuthor, CmsItem } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateAuthorInputSchema } from '~/lib/cms/contracts'
import { createAuthor } from '~/server/utils/cms/authors'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsAuthor>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsCreateAuthorInputSchema)
  const author = await createAuthor(ctx, input)
  setResponseStatus(event, 201)
  return { data: author }
})
