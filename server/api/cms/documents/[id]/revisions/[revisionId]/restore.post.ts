import type { CmsDocument, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'
import { z } from 'zod'

import { requireCmsContext } from '~/server/utils/cms/context'
import { restoreRevision } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'

const bodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
})

/** Restores into the draft only; publishing stays a separate, explicit action. */
export default defineCmsHandler(async (event): Promise<CmsItem<CmsDocument>> => {
  const ctx = await requireCmsContext(event, null, { documentId: getRouterParam(event, 'id') })
  const { expectedVersion } = await readCmsBody(event, bodySchema)
  return { data: await restoreRevision(ctx, getRouterParam(event, 'revisionId'), expectedVersion) }
})
