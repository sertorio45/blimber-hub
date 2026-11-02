import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery, getRouterParam } from 'h3'

import { mapCampaignRow } from '~/composables/whatsapp/useWhatsAppMapper'
import type { WhatsAppCampaignAudienceFilter } from '~/types/whatsapp'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import {
  buildCampaignRecipients,
  processCampaignSend,
  resolveAudienceContacts,
} from '~/server/utils/whatsapp/campaign-service'

const CAMPAIGN_SELECT = `
  *,
  whatsapp_instance:instance_id (name)
`

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
  const client = serverSupabaseServiceRole(event)

  const { data: campaign, error } = await client
    .from('whatsapp_campaign')
    .select('*, whatsapp_instance:instance_id (id, name, provider, status)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !campaign)
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Campaign cannot be started in current status',
    })
  }

  const instance = campaign.whatsapp_instance as Record<string, any> | null
  if (!instance || instance.provider !== 'evolution') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Campanhas disponíveis apenas para instâncias Evolution API',
    })
  }

  if (instance.status !== 'connected') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Instância WhatsApp não está conectada',
    })
  }

  const filter = (campaign.audience_filter || {}) as WhatsAppCampaignAudienceFilter
  if (!filter.message?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Campaign message is empty' })
  }

  if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Campaign is scheduled for a future date',
    })
  }

  const preview = await resolveAudienceContacts(client, tenantId, filter)
  if (!preview.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nenhum contato elegível para esta campanha',
    })
  }

  if (campaign.status === 'draft' || campaign.status === 'scheduled') {
    await buildCampaignRecipients(client, id, tenantId, filter)
  }
  else if (campaign.status === 'paused') {
    const { count } = await client
      .from('whatsapp_campaign_recipient')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .eq('tenant_id', tenantId)

    if (!count) {
      await buildCampaignRecipients(client, id, tenantId, filter)
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from('whatsapp_campaign')
    .update({
      status: 'running',
      started_at: campaign.started_at || now,
      completed_at: null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(CAMPAIGN_SELECT)
    .single()

  if (updateError || !updated)
    throw createError({ statusCode: 400, statusMessage: updateError?.message || 'Failed to start' })

  // Bounded batch in-request — never fire-and-forget a while(true) on Vercel
  // (that burned Hobby Active CPU with 300s timeouts). UI tick continues the rest.
  try {
    await processCampaignSend(client, id, tenantId)
  }
  catch (err) {
    console.error('[WhatsApp] Campaign send batch failed:', err)
  }

  const { data: afterBatch } = await client
    .from('whatsapp_campaign')
    .select(CAMPAIGN_SELECT)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return {
    data: mapCampaignRow((afterBatch || updated) as any),
    audienceSize: preview.length,
  }
})
