import { createError, readBody } from 'h3'

import { mapConversationRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { loadActiveAgentsForConversations } from '~/server/utils/whatsapp/conversation-agent-meta'
import { syncWhatsAppContactToCrmWithLead } from '~/server/utils/whatsapp/crm-sync'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { serverSupabaseServiceRole } from '#supabase/server'

interface SyncCrmBody {
  tenant_id?: string
  create_if_missing?: boolean
  create_lead?: boolean
  value?: number
  service_name?: string | null
  product_id?: string | null
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const body = await readBody<SyncCrmBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)
  const client = serverSupabaseServiceRole(event)

  const { data: conversation, error: convError } = await client
    .from('whatsapp_conversation')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (convError || !conversation)
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  if (conversation.is_group) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Grupos não podem ser sincronizados automaticamente com o CRM',
    })
  }

  if (!conversation.contact_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Conversa sem contato vinculado para sincronizar com o CRM',
    })
  }

  const { data: contact, error: contactError } = await client
    .from('whatsapp_contact')
    .select('*')
    .eq('id', conversation.contact_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (contactError || !contact)
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const result = await syncWhatsAppContactToCrmWithLead(client, tenantId, contact, {
    createIfMissing: body.create_if_missing ?? true,
    createLead: body.create_lead ?? true,
    conversationId: id,
    existingLeadId: conversation.lead_id as string | null,
    leadValue: body.value,
    serviceName: body.service_name,
    productId: body.product_id,
  })

  const { data: updated } = await client
    .from('whatsapp_conversation')
    .update({
      crm_contact_id: result.crmContact.id,
      lead_id: result.lead?.id ?? conversation.lead_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  const activeAgents = await loadActiveAgentsForConversations(client, tenantId, [id])

  return {
    data: mapConversationRow(updated as any, activeAgents.get(id) ?? null),
    crmContact: result.crmContact,
    lead: result.lead,
    leadCreated: result.leadCreated,
  }
})
