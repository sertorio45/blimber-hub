import { serverSupabaseServiceRole } from '#supabase/server'
import { getQuery } from 'h3'

import { resolveWhatsAppTenantContext, sanitizeInstanceRow } from '~/server/utils/whatsapp/context'

const INSTANCE_LIST_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'phone_number',
  'status',
  'is_default',
  'provider',
  'qr_code',
  'connection_state',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const INTEGRATION_LIST_COLUMNS = [
  'id',
  'instance_id',
  'tenant_id',
  'provider',
  'api_url',
  'cloud_phone_id',
  'cloud_business_id',
  'settings',
  'api_token_encrypted',
  'cloud_access_token_encrypted',
  'webhook_secret',
].join(', ')

type ConversationStatRow = {
  instance_id: string
  conversation_count: number | string
  unread_count: number | string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
  const client = serverSupabaseServiceRole(event)

  const { data: instances, error } = await client
    .from('whatsapp_instance')
    .select(INSTANCE_LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const instanceIds = (instances || []).map(i => i.id as string)
  let integrations: Record<string, any>[] = []

  const [integrationsResult, statsResult] = await Promise.all([
    instanceIds.length
      ? client
        .from('whatsapp_integration')
        .select(INTEGRATION_LIST_COLUMNS)
        .in('instance_id', instanceIds)
      : Promise.resolve({ data: [] as Record<string, any>[], error: null }),
    client.rpc('whatsapp_conversation_stats_by_instance', {
      p_tenant_id: tenantId,
      p_instance_ids: instanceIds.length ? instanceIds : null,
      p_assigned_to: null,
    }),
  ])

  if (integrationsResult.error) {
    throw createError({ statusCode: 400, statusMessage: integrationsResult.error.message })
  }
  integrations = integrationsResult.data || []

  const statsByInstance = new Map<string, { conversationCount: number, unreadCount: number }>()
  if (statsResult.error) {
    console.error('[whatsapp/instances] stats rpc failed', statsResult.error.message)
  }
  else {
    for (const row of (statsResult.data || []) as ConversationStatRow[]) {
      if (!row.instance_id)
        continue
      statsByInstance.set(row.instance_id, {
        conversationCount: Number(row.conversation_count || 0),
        unreadCount: Number(row.unread_count || 0),
      })
    }
  }

  const integrationMap = new Map(integrations.map(i => [i.instance_id, i]))

  let totalUnread = 0
  let totalConversations = 0
  for (const stats of statsByInstance.values()) {
    totalUnread += stats.unreadCount
    totalConversations += stats.conversationCount
  }

  return {
    data: (instances || []).map((row) => {
      const stats = statsByInstance.get(row.id as string) || { conversationCount: 0, unreadCount: 0 }
      return {
        ...sanitizeInstanceRow(row, integrationMap.get(row.id) || null),
        conversationCount: stats.conversationCount,
        unreadCount: stats.unreadCount,
      }
    }),
    meta: {
      totalUnread,
      totalConversations,
    },
  }
})
