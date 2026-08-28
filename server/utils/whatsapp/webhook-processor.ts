import type { SupabaseClient } from '@supabase/supabase-js'

import { mapEvolutionConnectionState } from '~/server/utils/whatsapp/evolution-client'
import { buildWhatsAppRemoteJid, findOrUpsertWhatsAppConversation, resolveEvolutionRemoteJid } from '~/server/utils/whatsapp/conversation-utils'
import { normalizePhone } from '~/server/utils/whatsapp/contact-utils'
import {
  buildCtwaMessageMetadata,
  extractCtwaReferral,
  upsertWhatsappAttribution,
} from '~/server/utils/whatsapp/ctwa-attribution'
import { broadcastWhatsAppEvent } from '~/server/utils/whatsapp/realtime-broadcast'
import {
  conversationHasActiveAgent,
  dispatchConversationAgentReply,
} from '~/server/utils/whatsapp/conversation-agent'
import { dispatchWhatsAppFlows } from '~/server/utils/whatsapp/flow-dispatcher'

function normalizeEvolutionEventName(raw: unknown): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/_/g, '.')
    .replace(/-/g, '.')
}

function extractEvolutionMessages(payload: Record<string, any>): Record<string, any>[] {
  const data = payload.data
  if (!data)
    return []
  if (Array.isArray(data))
    return data.filter(Boolean)
  if (Array.isArray(data.messages))
    return data.messages.filter(Boolean)
  if (data.key || data.message)
    return [data]
  return []
}

function extractMessageText(message: Record<string, any> | undefined): string {
  if (!message)
    return ''

  const nested
    = message.ephemeralMessage?.message
      || message.viewOnceMessage?.message
      || message.documentWithCaptionMessage?.message

  const target = nested || message

  return String(
    target.conversation
    || target.extendedTextMessage?.text
    || target.imageMessage?.caption
    || target.videoMessage?.caption
    || target.buttonsResponseMessage?.selectedDisplayText
    || '',
  )
}

function shouldIgnoreEvolutionJid(remoteJid: string): boolean {
  if (!remoteJid)
    return true
  if (remoteJid.includes('status@broadcast') || remoteJid.endsWith('@broadcast'))
    return true
  // Groups use another JID format — skip to avoid wrong contact_phone saves.
  if (remoteJid.endsWith('@g.us'))
    return true
  return false
}

async function upsertContact(
  client: SupabaseClient,
  tenantId: string,
  phone: string,
  name?: string,
) {
  const { data: existing } = await client
    .from('whatsapp_contact')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle()

  if (existing?.id)
    return existing.id

  const { data: created, error } = await client
    .from('whatsapp_contact')
    .insert({
      tenant_id: tenantId,
      phone,
      name: name || phone,
      tags: [],
      custom_fields: {},
      opt_in: true,
      blocked: false,
    })
    .select('id')
    .single()

  if (error)
    throw error

  return created.id as string
}

async function dispatchInboundAutomation(
  client: SupabaseClient,
  params: {
    tenantId: string
    instanceId: string
    contactId: string
    conversationId: string
    remoteJid: string
    messageId: string
    messageContent: string
    messageType: string
    fromMe: boolean
    sentAt?: string | null
    contactPhone: string
    contactName?: string | null
  },
) {
  const hasActiveAgent = await conversationHasActiveAgent(
    client,
    params.tenantId,
    params.conversationId,
  )

  if (hasActiveAgent) {
    await dispatchConversationAgentReply(client, params)
    return
  }

  await dispatchWhatsAppFlows(client, params)
}

export async function processEvolutionWebhook(
  client: SupabaseClient,
  instance: Record<string, any>,
  payload: Record<string, any>,
) {
  const tenantId = instance.tenant_id as string
  const instanceId = instance.id as string
  const event = normalizeEvolutionEventName(payload.event || payload.type)

  if (event === 'connection.update') {
    const mapped = mapEvolutionConnectionState(payload.data || payload)
    await client
      .from('whatsapp_instance')
      .update({
        status: mapped.status,
        phone_number: mapped.phoneNumber || instance.phone_number,
        connection_state: payload.data || payload,
        qr_code: mapped.status === 'connected' ? null : instance.qr_code,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instanceId)

    return { handled: true, type: 'connection' }
  }

  if (event === 'messages.upsert') {
    const messages = extractEvolutionMessages(payload)

    for (const item of messages) {
      if (!item?.key)
        continue

      const remoteJid = resolveEvolutionRemoteJid(item.key)
      if (shouldIgnoreEvolutionJid(remoteJid))
        continue

      const fromMe = Boolean(item.key.fromMe)
      const phone = normalizePhone(remoteJid)
      const pushName = String(item.pushName || phone)
      const messageId = String(item.key.id || '').trim()
      if (!messageId)
        continue

      const { data: existingMsg } = await client
        .from('whatsapp_message')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('external_id', messageId)
        .maybeSingle()

      // Idempotency: Evolution retries webhooks and may register duplicate endpoints.
      if (existingMsg?.id)
        continue

      const timestamp = item.messageTimestamp
        ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString()

      const text = extractMessageText(item.message)
      const referral = !fromMe
        ? extractCtwaReferral(item as Record<string, unknown>)
        || extractCtwaReferral((item.message || {}) as Record<string, unknown>)
        : null
      const metadata = referral ? buildCtwaMessageMetadata(referral) : {}

      if (referral) {
        await upsertWhatsappAttribution(client, {
          tenantId,
          instanceId,
          phone,
          referral,
          receivedAt: timestamp,
        })
      }

      const contactId = await upsertContact(client, tenantId, phone, pushName)
      const conversationId = await findOrUpsertWhatsAppConversation(client, {
        tenantId,
        instanceId,
        contactId,
        remoteJid,
        contactName: pushName,
        contactPhone: phone,
        lastMessagePreview: text || '[mídia]',
        lastMessageAt: timestamp,
        fromMe,
      })

      const { data: inserted } = await client.from('whatsapp_message').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        instance_id: instanceId,
        contact_id: contactId,
        external_id: messageId,
        remote_jid: remoteJid,
        from_me: fromMe,
        message_type: item.messageType || 'text',
        content: text,
        media_url: item.message?.imageMessage?.url || null,
        status: fromMe ? 'sent' : 'delivered',
        sent_at: timestamp,
        metadata,
      }).select('*').single()

      if (inserted) {
        await broadcastWhatsAppEvent(tenantId, 'message', inserted)

        if (!fromMe) {
          try {
            await dispatchInboundAutomation(client, {
              tenantId,
              instanceId,
              contactId,
              conversationId,
              remoteJid,
              messageId: inserted.id as string,
              messageContent: text,
              messageType: String(item.messageType || 'text'),
              fromMe,
              sentAt: timestamp,
              contactPhone: phone,
              contactName: pushName,
            })
          }
          catch (err: any) {
            console.error('[WhatsApp] Inbound automation failed:', err?.message || err)
          }
        }
      }
    }

    return { handled: true, type: 'message' }
  }

  if (event === 'messages.update') {
    const updates = Array.isArray(payload.data) ? payload.data : [payload.data]
    for (const item of updates) {
      const messageId = String(item?.key?.id || '')
      const status = String(item?.update?.status || item?.status || '').toLowerCase()
      if (!messageId || !status)
        continue

      const mappedStatus
        = status === 'read' ? 'read'
          : status === 'delivery_ack' ? 'delivered'
            : status === 'server_ack' ? 'sent'
              : status

      const { data: updated } = await client
        .from('whatsapp_message')
        .update({ status: mappedStatus, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('external_id', messageId)
        .select('*')
        .maybeSingle()

      if (updated)
        await broadcastWhatsAppEvent(tenantId, 'message', updated)
    }

    return { handled: true, type: 'status' }
  }

  return { handled: false, type: 'ignored' }
}

/**
 * Coexistence: messages the agent sends from the WhatsApp Business app on their phone
 * arrive as echoes on a separate field. Without mirroring them the inbox only shows
 * the customer's half of the conversation.
 */
async function processCloudMessageEchoes(
  client: SupabaseClient,
  params: {
    tenantId: string
    instanceId: string
    echoes: Record<string, any>[]
  },
) {
  const { tenantId, instanceId, echoes } = params

  for (const msg of echoes) {
    const externalId = String(msg.id || '').trim()
    if (!externalId)
      continue

    const { data: existingMsg } = await client
      .from('whatsapp_message')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('external_id', externalId)
      .maybeSingle()

    // Also dedupes against messages we sent through Cloud API ourselves.
    if (existingMsg?.id)
      continue

    // On an echo the customer is the recipient, not the sender.
    const phone = normalizePhone(String(msg.to || msg.recipient_id || ''))
    if (!phone)
      continue

    const remoteJid = buildWhatsAppRemoteJid(phone)
    const text = msg.text?.body || msg.button?.text || ''
    const timestamp = msg.timestamp
      ? new Date(Number(msg.timestamp) * 1000).toISOString()
      : new Date().toISOString()

    const contactId = await upsertContact(client, tenantId, phone, phone)
    const conversationId = await findOrUpsertWhatsAppConversation(client, {
      tenantId,
      instanceId,
      contactId,
      remoteJid,
      contactName: phone,
      contactPhone: phone,
      lastMessagePreview: text || `[${msg.type || 'mídia'}]`,
      lastMessageAt: timestamp,
      fromMe: true,
    })

    const { data: inserted } = await client.from('whatsapp_message').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      instance_id: instanceId,
      contact_id: contactId,
      external_id: externalId,
      remote_jid: remoteJid,
      from_me: true,
      message_type: msg.type || 'text',
      content: text,
      status: 'sent',
      sent_at: timestamp,
      metadata: { source: 'smb_message_echo' },
    }).select('*').single()

    if (inserted)
      await broadcastWhatsAppEvent(tenantId, 'message', inserted)
  }
}

async function processCloudChangeValue(
  client: SupabaseClient,
  params: {
    tenantId: string
    instanceId: string
    wabaId: string | null
    field?: string | null
    value: Record<string, any>
  },
) {
  const { tenantId, instanceId, wabaId, field, value } = params

  if (field === 'smb_message_echoes') {
    const echoes: Record<string, any>[] = Array.isArray(value.message_echoes)
      ? value.message_echoes
      : Array.isArray(value.messages) ? value.messages : []

    if (!echoes.length)
      return null

    await processCloudMessageEchoes(client, { tenantId, instanceId, echoes })
    return 'message' as const
  }

  if (value.messages?.length) {
    for (const msg of value.messages) {
      const externalId = String(msg.id)

      // Meta retries webhooks for up to 7 days and can fan out to several subscribers.
      const { data: existingMsg } = await client
        .from('whatsapp_message')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('external_id', externalId)
        .maybeSingle()

      if (existingMsg?.id)
        continue

      const phone = normalizePhone(String(msg.from || ''))
      const remoteJid = buildWhatsAppRemoteJid(phone)
      const contactName = value.contacts?.[0]?.profile?.name || phone
      const text = msg.text?.body || msg.button?.text || ''
      const timestamp = msg.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString()

      const referral = extractCtwaReferral(msg as Record<string, unknown>)
      const metadata = referral ? buildCtwaMessageMetadata(referral) : {}
      if (referral) {
        await upsertWhatsappAttribution(client, {
          tenantId,
          instanceId,
          wabaId,
          phone,
          referral,
          receivedAt: timestamp,
        })
      }

      const contactId = await upsertContact(client, tenantId, phone, contactName)
      const conversationId = await findOrUpsertWhatsAppConversation(client, {
        tenantId,
        instanceId,
        contactId,
        remoteJid,
        contactName,
        contactPhone: phone,
        lastMessagePreview: text || `[${msg.type}]`,
        lastMessageAt: timestamp,
        fromMe: false,
      })

      const { data: inserted } = await client.from('whatsapp_message').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        instance_id: instanceId,
        contact_id: contactId,
        external_id: externalId,
        remote_jid: remoteJid,
        from_me: false,
        message_type: msg.type || 'text',
        content: text,
        status: 'delivered',
        sent_at: timestamp,
        metadata,
      }).select('*').single()

      if (inserted) {
        await broadcastWhatsAppEvent(tenantId, 'message', inserted)
      }
    }

    return 'message' as const
  }

  if (value.statuses?.length) {
    for (const st of value.statuses) {
      const mappedStatus = st.status === 'read' ? 'read' : st.status === 'delivered' ? 'delivered' : 'sent'
      const { data: updated } = await client
        .from('whatsapp_message')
        .update({ status: mappedStatus })
        .eq('tenant_id', tenantId)
        .eq('external_id', String(st.id))
        .select('*')
        .maybeSingle()

      if (updated)
        await broadcastWhatsAppEvent(tenantId, 'message', updated)
    }

    return 'status' as const
  }

  return null
}

export async function processCloudWebhook(
  client: SupabaseClient,
  instance: Record<string, any>,
  payload: Record<string, any>,
) {
  const tenantId = instance.tenant_id as string
  const instanceId = instance.id as string
  const entries: Record<string, any>[] = Array.isArray(payload.entry) ? payload.entry : []

  const types = new Set<string>()

  // Meta batches multiple entries/changes per delivery; processing only the first drops messages.
  for (const entry of entries) {
    const wabaId = entry?.id ? String(entry.id) : null
    const changes: Record<string, any>[] = Array.isArray(entry?.changes) ? entry.changes : []

    for (const change of changes) {
      const value = change?.value
      if (!value)
        continue

      const handledType = await processCloudChangeValue(client, {
        tenantId,
        instanceId,
        wabaId,
        field: change?.field ? String(change.field) : null,
        value,
      })

      if (handledType)
        types.add(handledType)
    }
  }

  if (!types.size)
    return { handled: false, type: 'ignored' }

  return { handled: true, type: types.has('message') ? 'message' : 'status' }
}
