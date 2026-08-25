import { getRouterParam } from 'h3'

import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'

/** Hard-deletes an editorial campaign. Linked posts keep campaign_id SET NULL via FK. */
export default defineEventHandler(async (event) => {
  const campaignId = String(getRouterParam(event, 'id'))
  const { client, tenantId, user } = await requireSocialContext(
    event,
    'marketing.social.campaigns.manage',
  )

  const { data: existing, error: lookupError } = await client
    .from('social_campaigns')
    .select('id, name, status')
    .eq('id', campaignId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (lookupError)
    throw createError({ statusCode: 400, statusMessage: lookupError.message })
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Campanha não encontrada' })

  const { error } = await client
    .from('social_campaigns')
    .delete()
    .eq('id', campaignId)
    .eq('tenant_id', tenantId)

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'campaign.deleted',
    entityType: 'social_campaign',
    entityId: campaignId,
    before: { name: existing.name, status: existing.status },
  })

  return { success: true, data: { id: campaignId } }
})
