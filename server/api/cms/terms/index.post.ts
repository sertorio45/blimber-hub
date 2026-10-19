import type { CmsItem, CmsTerm } from '~/lib/cms/contracts'

import { setResponseStatus } from 'h3'

import { cmsCreateTermInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { createTerm } from '~/server/utils/cms/taxonomies'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsTerm>> => {
  const ctx = await requireCmsContext(event, 'cms.read')
  const input = await readCmsBody(event, cmsCreateTermInputSchema)
  const term = await createTerm(ctx, input)
  setResponseStatus(event, 201)
  return { data: term }
})
