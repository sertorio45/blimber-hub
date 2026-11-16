import { createError, readBody } from 'h3'

import {
  closeConversationAgentSessions,
  enableConversationAgent,
  replyToPendingInboundOnAgentEnable,
} from '~/server/utils/whatsapp/conversation-agent'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { serverSupabaseServiceRole } from '#supabase/server'

interface UpdateAgentBody {
  tenant_id?: string
  agent_id?: string | null
  enabled?: boolean
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const body = await readBody<UpdateAgentBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)
  const client = serverSupabaseServiceRole(event)

  const { data: conversation, error } = await client
    .from('whatsapp_conversation')
    .select('id, contact_id, is_group')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !conversation)
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  if (conversation.is_group) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Agentes IA não estão disponíveis em grupos',
    })
  }

  const enabled = body.enabled !== false && Boolean(body.agent_id)

  if (!enabled) {
    await closeConversationAgentSessions(client, tenantId, id)
    return {
      data: {
        enabled: false,
        agentId: null,
        agentName: null,
        sessionId: null,
      },
    }
  }

  const agentId = String(body.agent_id || '').trim()
  if (!agentId)
    throw createError({ statusCode: 400, statusMessage: 'agent_id is required when enabled' })

  try {
    const session = await enableConversationAgent(client, {
      tenantId,
      conversationId: id,
      contactId: conversation.contact_id as string | null,
      agentId,
    })

    const catchUp = await replyToPendingInboundOnAgentEnable(client, {
      tenantId,
      conversationId: id,
    })

    return {
      data: {
        enabled: true,
        agentId: session.agentId,
        agentName: session.agentName,
        sessionId: session.sessionId,
        catchUpReplied: catchUp.replied,
      },
    }
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to enable agent'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
