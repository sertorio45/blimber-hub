import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery } from 'h3'

import { mapConversationRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { dedupeConversationRows } from '~/server/utils/whatsapp/conversation-utils'
import { loadActiveAgentsForConversations } from '~/server/utils/whatsapp/conversation-agent-meta'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)

  const status = query.status as string | undefined
  const search = (query.search as string | undefined)?.trim()
  const unreadOnly = query.unread_only === 'true'
  const assignedToMe = query.assigned_to_me === 'true'
  const chatType = (query.chat_type as string | undefined)?.trim() || 'all'
  const instanceId = (query.instance_id as string | undefined)?.trim() || undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  const client = serverSupabaseServiceRole(event)

  let currentUserId: string | null = null
  if (assignedToMe) {
    const { user } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
    currentUserId = user.id
  }

  let req = client
    .from('whatsapp_conversation')
    .select('*, whatsapp_instance(id, name, phone_number, status)')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (instanceId)
    req = req.eq('instance_id', instanceId)

  if (status && status !== 'all')
    req = req.eq('status', status)

  if (chatType === 'group')
    req = req.eq('is_group', true)
  else if (chatType === 'direct')
    req = req.eq('is_group', false)

  if (unreadOnly)
    req = req.gt('unread_count', 0)

  if (assignedToMe && currentUserId)
    req = req.eq('assigned_to', currentUserId)

  if (search) {
    req = req.or(
      `contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%,last_message_preview.ilike.%${search}%`,
    )
  }

  const { data, error } = await req

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const rows = dedupeConversationRows(data || [])
  const activeAgents = await loadActiveAgentsForConversations(
    client,
    tenantId,
    rows.map(row => row.id as string),
  )

  return {
    data: rows.map(row => mapConversationRow(
      row as any,
      activeAgents.get(row.id as string) ?? null,
    )),
  }
})
