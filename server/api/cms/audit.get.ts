import type { CmsAuditEvent, CmsPage } from '~/lib/cms/contracts'

import { cmsAuditListQuerySchema } from '~/lib/cms/contracts'
import { listCmsAuditEvents } from '~/server/utils/cms/audit-log'
import { requireCmsContext } from '~/server/utils/cms/context'
import { defineCmsHandler, readCmsQuery } from '~/server/utils/cms/http'

export default defineCmsHandler(async (event): Promise<CmsPage<CmsAuditEvent>> => {
  const ctx = await requireCmsContext(event, null)
  return listCmsAuditEvents(ctx, readCmsQuery(event, cmsAuditListQuerySchema))
})
