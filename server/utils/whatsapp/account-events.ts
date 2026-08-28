import type { SupabaseClient } from '@supabase/supabase-js'

import { broadcastWhatsAppEvent } from '~/server/utils/whatsapp/realtime-broadcast'

/** Events that mean the tenant is no longer reachable through Cloud API. */
const DISCONNECT_EVENTS = new Set([
  'PARTNER_REMOVED',
  'ACCOUNT_OFFBOARDED',
  'ACCOUNT_DELETED',
  'DISABLED_UPDATE',
])

const RECONNECT_EVENTS = new Set([
  'PARTNER_ADDED',
  'ACCOUNT_RECONNECTED',
  'ACCOUNT_RESTORED',
])

export interface AccountUpdateResult {
  handled: boolean
  event: string | null
  status?: 'connected' | 'disconnected'
}

/**
 * Resolves the instance a WABA-level webhook belongs to. Message webhooks arrive on
 * the per-instance override URL, but management events keep landing on the app-level
 * callback, where the WABA id is the only routing key we get.
 */
export async function findInstanceByWabaId(client: SupabaseClient, wabaId: string) {
  const { data: integration } = await client
    .from('whatsapp_integration')
    .select('*')
    .eq('provider', 'cloud_api')
    .eq('cloud_business_id', wabaId)
    .maybeSingle()

  if (!integration?.instance_id)
    return null

  const { data: instance } = await client
    .from('whatsapp_instance')
    .select('*')
    .eq('id', integration.instance_id)
    .maybeSingle()

  if (!instance)
    return null

  return { instance, integration }
}

export async function processAccountUpdate(
  client: SupabaseClient,
  instance: Record<string, any>,
  value: Record<string, any>,
): Promise<AccountUpdateResult> {
  const eventName = String(value?.event || '').toUpperCase()
  if (!eventName)
    return { handled: false, event: null }

  const isDisconnect = DISCONNECT_EVENTS.has(eventName)
  const isReconnect = RECONNECT_EVENTS.has(eventName)

  if (!isDisconnect && !isReconnect)
    return { handled: false, event: eventName }

  const status = isDisconnect ? 'disconnected' : 'connected'
  const connectionState = {
    ...(instance.connection_state || {}),
    last_account_event: eventName,
    last_account_event_at: new Date().toISOString(),
    // PRIMARY_INACTIVITY means the client stopped opening the WhatsApp Business app.
    disconnection_reason: value?.disconnection_info?.reason || null,
    disconnection_initiated_by: value?.disconnection_info?.initiated_by || null,
  }

  const { data: updated } = await client
    .from('whatsapp_instance')
    .update({
      status,
      connection_state: connectionState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id)
    .select('*')
    .maybeSingle()

  if (updated)
    await broadcastWhatsAppEvent(instance.tenant_id, 'instance', updated)

  return { handled: true, event: eventName, status }
}
