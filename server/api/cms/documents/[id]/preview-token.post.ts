import type { CmsItem, CmsPreviewToken } from '~/lib/cms/contracts'

import { getRouterParam } from 'h3'

import { cmsPreviewTokenInputSchema } from '~/lib/cms/contracts'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsBody } from '~/server/utils/cms/http'
import { issueCmsPreviewToken } from '~/server/utils/cms/preview'

/** `cms.read` only. The token is opaque and does not embed the admin session. */
export default defineCmsHandler(async (event): Promise<CmsItem<CmsPreviewToken>> => {
  const ctx = await requireCmsContext(event, 'cms.read', { documentId: getRouterParam(event, 'id') })
  const input = await readCmsBody(event, cmsPreviewTokenInputSchema)
  return { data: await issueCmsPreviewToken(ctx, input.revisionId) }
})
