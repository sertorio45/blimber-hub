import type { CmsEntry, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam, setResponseStatus } from 'h3'

import { cmsSaveEntryInputSchema } from '~/lib/cms/contracts'
import { createCollectionEntry } from '~/server/utils/cms/collections'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsItem<CmsEntry>> => {
  const ctx = await requireCmsContext(event, 'cms.schemas.manage')
  const input = await readCmsBody(event, cmsSaveEntryInputSchema, 96 * 1024)
  const entry = await createCollectionEntry(ctx, getRouterParam(event, 'id'), input)
  setResponseStatus(event, 201)
  return { data: entry }
})
