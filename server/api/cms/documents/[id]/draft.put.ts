import type { CmsDocument, CmsItem } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { requireCmsContext } from '~/server/utils/cms/context'
import { CMS_DRAFT_BODY_BYTES, parseSaveDraftInput, saveDraft } from '~/server/utils/cms/documents'
import { defineCmsHandler, readCmsJsonBody } from '~/server/utils/cms/http'

/** Autosave with optimistic locking: a stale `expectedVersion` answers 409 `version_conflict`. */
export default defineCmsHandler(async (event): Promise<CmsItem<CmsDocument>> => {
  const ctx = await requireCmsContext(event, null, { documentId: getRouterParam(event, 'id') })
  const input = parseSaveDraftInput(await readCmsJsonBody(event, CMS_DRAFT_BODY_BYTES))
  return { data: await saveDraft(ctx, input) }
})
