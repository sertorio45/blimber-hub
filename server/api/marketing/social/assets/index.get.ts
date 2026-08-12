import { getQuery } from 'h3'

import { attachMediaAssetPreviews } from '~/server/utils/media-asset-preview'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedTenantId = typeof query.tenant_id === 'string' ? query.tenant_id : null
  const { client, tenantId } = await requireSocialContext(
    event,
    'marketing.social.read',
    requestedTenantId,
  )

  let request = client
    .from('media_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(query.limit || 60))))

  if (query.mime)
    request = request.like('mime_type', `${String(query.mime)}%`)
  if (query.purpose && ['reference', 'publication'].includes(String(query.purpose)))
    request = request.eq('purpose', String(query.purpose))
  if (query.search)
    request = request.ilike('name', `%${String(query.search).trim()}%`)
  if (query.folderId)
    request = request.eq('folder_id', String(query.folderId))
  if (query.lifecycle && ['active', 'archived', 'discontinued'].includes(String(query.lifecycle)))
    request = request.eq('lifecycle', String(query.lifecycle))
  else
    request = request.neq('lifecycle', 'discontinued')
  if (query.category)
    request = request.eq('category', String(query.category))
  if (query.campaignId)
    request = request.eq('campaign_id', String(query.campaignId))

  const { data, error } = await request
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return {
    data: await attachMediaAssetPreviews(client, data || [], tenantId),
  }
})
