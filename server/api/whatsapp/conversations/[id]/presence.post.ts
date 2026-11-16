import { createError, readBody } from 'h3'

import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'
import { sendWhatsAppPresence } from '~/server/utils/whatsapp/message-sender'
import { serverSupabaseServiceRole } from '#supabase/server'

interface PresenceBody {
  tenant_id?: string
  presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
  delay?: number
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const body = await readBody<PresenceBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)

  if (!body.presence)
    throw createError({ statusCode: 400, statusMessage: 'presence is required' })

  const client = serverSupabaseServiceRole(event)
  const { data: conversation } = await client
    .from('whatsapp_conversation')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conversation)
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  if (!conversation.instance_id)
    throw createError({ statusCode: 400, statusMessage: 'Conversation has no instance' })

  const { instance, integration } = await loadInstanceWithIntegration(event, conversation.instance_id)
  if (!integration)
    throw createError({ statusCode: 400, statusMessage: 'Integration not configured' })

  await sendWhatsAppPresence({
    instance,
    integration,
    phone: conversation.contact_phone || conversation.remote_jid,
    remoteJid: conversation.remote_jid,
    presence: body.presence,
    delay: body.delay,
  })

  return { success: true }
})
