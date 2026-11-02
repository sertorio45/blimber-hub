import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery, getRouterParam } from 'h3'

import { mapCampaignRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { processCampaignSend } from '~/server/utils/whatsapp/campaign-service'

const CAMPAIGN_SELECT = `
  *,
  whatsapp_instance:instance_id (name)
`

/**
 * Continues a running campaign in a short, bounded batch.
 * Called by the campaign detail poll so sends never rely on a single long invocation.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
  const client = serverSupabaseServiceRole(event)

  const { data: campaign, error } = await client
    .from('whatsapp_campaign')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !campaign)
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  if (campaign.status !== 'running') {
    const { data: current } = await client
      .from('whatsapp_campaign')
      .select(CAMPAIGN_SELECT)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    return {
      data: mapCampaignRow(current as any),
      processed: 0,
      hasPending: false,
    }
  }

  const result = await processCampaignSend(client, id, tenantId)

  const { data: updated, error: readError } = await client
    .from('whatsapp_campaign')
    .select(CAMPAIGN_SELECT)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (readError || !updated)
    throw createError({ statusCode: 400, statusMessage: readError?.message || 'Failed to read campaign' })

  return {
    data: mapCampaignRow(updated as any),
    processed: result.processed,
    hasPending: result.hasPending,
  }
})
