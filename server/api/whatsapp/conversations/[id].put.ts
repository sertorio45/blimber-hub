import { createError, readBody } from 'h3'

import { mapConversationRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { loadActiveAgentsForConversations } from '~/server/utils/whatsapp/conversation-agent-meta'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import {
  evolutionMarkMessageAsRead,
  getEvolutionConfigFromIntegration,
} from '~/server/utils/whatsapp/evolution-client'
import { getEvolutionInstanceName, loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'
import { serverSupabaseServiceRole } from '#supabase/server'

interface UpdateConversationBody {
  tenant_id?: string
  status?: 'open' | 'pending' | 'resolved' | 'spam'
  assigned_to?: string | null
  mark_read?: boolean
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const body = await readBody<UpdateConversationBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)
  const client = serverSupabaseServiceRole(event)

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status)
    update.status = body.status
  if (body.assigned_to !== undefined)
    update.assigned_to = body.assigned_to
  if (body.mark_read)
    update.unread_count = 0

  const { data, error } = await client
    .from('whatsapp_conversation')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  if (body.mark_read && data?.instance_id) {
    try {
      const { instance, integration } = await loadInstanceWithIntegration(event, data.instance_id)
      if (instance.provider === 'evolution' && integration) {
        const evoConfig = getEvolutionConfigFromIntegration(integration, getEvolutionInstanceName(instance))
        if (evoConfig) {
          const { data: unreadMessages } = await client
            .from('whatsapp_message')
            .select('external_id, from_me, remote_jid')
            .eq('conversation_id', id)
            .eq('tenant_id', tenantId)
            .eq('from_me', false)
            .not('external_id', 'is', null)
            .order('sent_at', { ascending: false })
            .limit(20)

          const readMessages = (unreadMessages || [])
            .filter(row => row.external_id)
            .map(row => ({
              id: String(row.external_id),
              fromMe: false,
              remoteJid: String(row.remote_jid || data.remote_jid),
            }))

          if (readMessages.length)
            await evolutionMarkMessageAsRead(evoConfig, readMessages)
        }
      }
    }
    catch (err: any) {
      console.warn('[WhatsApp] markMessageAsRead failed:', err?.message || err)
    }
  }

  const activeAgents = await loadActiveAgentsForConversations(client, tenantId, [id])

  return {
    data: mapConversationRow(data as any, activeAgents.get(id) ?? null),
  }
})
