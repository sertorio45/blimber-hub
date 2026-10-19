import type { CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { trashDocument } from '~/server/utils/cms/documents'
import { defineCmsHandler } from '~/server/utils/cms/http'

/** Soft delete (trash). The delete capability depends on the document kind. */
export default defineCmsHandler(async (event): Promise<CmsItem<{ id: string, deletedAt: string }>> => {
  const ctx = await requireCmsContext(event, null, { documentId: getRouterParam(event, 'id') })
  return { data: await trashDocument(ctx) }
})
