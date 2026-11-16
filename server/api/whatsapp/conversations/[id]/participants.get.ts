import { createError, getQuery } from 'h3'

import { mapGroupParticipantRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
  const client = serverSupabaseServiceRole(event)

  const { data: conversation } = await client
    .from('whatsapp_conversation')
    .select('id, is_group')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conversation)
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  if (!conversation.is_group)
    return { data: [] }

  const { data, error } = await client
    .from('whatsapp_group_participant')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', id)
    .order('name', { ascending: true })

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return {
    data: (data || []).map(row => mapGroupParticipantRow(row as any)),
  }
})
