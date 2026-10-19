import { getQuery } from 'h3'

import { requireMarketingMediaContext } from '~/server/utils/media/marketing-adapter'
import { listAssets } from '~/server/utils/media/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedTenantId = typeof query.tenant_id === 'string' ? query.tenant_id : null
  const ctx = await requireMarketingMediaContext(event, 'read', requestedTenantId)

  const { data } = await listAssets(ctx, {
    limit: Math.min(200, Math.max(1, Number(query.limit || 60))),
    mimePrefix: query.mime ? String(query.mime) : null,
    purpose: query.purpose ? String(query.purpose) : null,
    search: query.search ? String(query.search).trim() : null,
    folderId: query.folderId ? String(query.folderId) : null,
    lifecycle: query.lifecycle ? String(query.lifecycle) : null,
    category: query.category ? String(query.category) : null,
    campaignId: query.campaignId ? String(query.campaignId) : null,
  })

  return { data }
})
