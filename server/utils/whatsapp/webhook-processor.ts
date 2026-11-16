import type { SupabaseClient } from '@supabase/supabase-js'

import {
  evolutionGetBase64FromMediaMessage,
  getEvolutionConfigFromIntegration,
  mapEvolutionConnectionState,
} from '~/server/utils/whatsapp/evolution-client'
import {
  buildWhatsAppRemoteJid,
  findOrUpsertWhatsAppConversation,
  isBroadcastJid,
  isGroupJid,
  normalizeWhatsAppJid,
  resolveEvolutionParticipantJid,
  resolveEvolutionRemoteJid,
  upsertGroupParticipant,
} from '~/server/utils/whatsapp/conversation-utils'
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
import { getEvolutionInstanceName } from '~/server/utils/whatsapp/instance-loader'
import { uploadWhatsAppMediaBase64 } from '~/server/utils/whatsapp/media-storage'

import type { WhatsAppMessageReaction } from '~/types/whatsapp'

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

function unwrapMessageContent(message: Record<string, any> | undefined): Record<string, any> {
  if (!message)
    return {}

  return message.ephemeralMessage?.message
    || message.viewOnceMessage?.message
    || message.viewOnceMessageV2?.message
    || message.documentWithCaptionMessage?.message
    || message
}

function extractMessageText(message: Record<string, any> | undefined): string {
  const target = unwrapMessageContent(message)

  return String(
    target.conversation
    || target.extendedTextMessage?.text
    || target.imageMessage?.caption
    || target.videoMessage?.caption
    || target.documentMessage?.caption
    || target.buttonsResponseMessage?.selectedDisplayText
    || target.listResponseMessage?.title
    || target.templateButtonReplyMessage?.selectedDisplayText
    || (target.locationMessage
      ? [target.locationMessage.name, target.locationMessage.address].filter(Boolean).join(' — ')
      : '')
    || (target.contactMessage?.displayName ? `Contato: ${target.contactMessage.displayName}` : '')
    || (target.audioMessage ? '[áudio]' : '')
    || (target.stickerMessage ? '[figurinha]' : '')
    || (target.documentMessage?.fileName ? `[documento] ${target.documentMessage.fileName}` : '')
    || (target.imageMessage ? '[imagem]' : '')
    || (target.videoMessage ? '[vídeo]' : '')
    || '',
  )
}

function detectMessageType(message: Record<string, any> | undefined, fallback?: string): string {
  const target = unwrapMessageContent(message)
  if (target.imageMessage)
    return 'image'
  if (target.videoMessage)
    return 'video'
  if (target.audioMessage)
    return 'audio'
  if (target.documentMessage || target.documentWithCaptionMessage)
    return 'document'
  if (target.stickerMessage)
    return 'sticker'
  if (target.locationMessage)
    return 'location'
  if (target.reactionMessage)
    return 'reaction'
  if (fallback)
    return String(fallback)
  return 'text'
}

function extractQuotedExternalId(message: Record<string, any> | undefined): string | null {
  const target = unwrapMessageContent(message)
  const context = target.extendedTextMessage?.contextInfo
    || target.imageMessage?.contextInfo
    || target.videoMessage?.contextInfo
    || target.documentMessage?.contextInfo
    || target.audioMessage?.contextInfo
  const id = String(context?.stanzaId || context?.quotedMessage?.key?.id || '').trim()
  return id || null
}

function shouldIgnoreEvolutionJid(remoteJid: string): boolean {
  if (!remoteJid)
    return true
  return isBroadcastJid(remoteJid)
}

function mapEvolutionMessageStatus(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '')
    return null

  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const code = Number(raw)
    // Baileys: ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5
    if (code >= 4)
      return 'read'
    if (code === 3)
      return 'delivered'
    if (code === 2)
      return 'sent'
    if (code <= 1)
      return 'pending'
  }

  const status = String(raw).toLowerCase()
  if (status === 'read' || status === 'played')
    return 'read'
  if (status === 'delivery_ack' || status === 'delivered')
    return 'delivered'
  if (status === 'server_ack' || status === 'sent')
    return 'sent'
  if (status === 'pending' || status === 'error' || status === 'failed')
    return status === 'error' ? 'failed' : status
  return status
}

async function upsertContact(
  client: SupabaseClient,
  tenantId: string,
  phone: string,
  name?: string,
) {
  const normalized = normalizePhone(phone)
  if (!normalized)
    return null

  const { data: existing } = await client
    .from('whatsapp_contact')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', normalized)
    .maybeSingle()

  if (existing?.id)
    return existing.id as string

  const { data: created, error } = await client
    .from('whatsapp_contact')
    .insert({
      tenant_id: tenantId,
      phone: normalized,
      name: name || normalized,
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

async function resolveInboundMedia(
  client: SupabaseClient,
  params: {
    instance: Record<string, any>
    integration?: Record<string, any> | null
    tenantId: string
    conversationId: string
    externalId: string
    item: Record<string, any>
    messageType: string
  },
): Promise<{ mediaUrl: string | null, mediaMime: string | null, fileName: string | null }> {
  const message = unwrapMessageContent(params.item.message)
  const directUrl = message.imageMessage?.url
    || message.videoMessage?.url
    || message.audioMessage?.url
    || message.documentMessage?.url
    || message.stickerMessage?.url
    || null

  const mime = message.imageMessage?.mimetype
    || message.videoMessage?.mimetype
    || message.audioMessage?.mimetype
    || message.documentMessage?.mimetype
    || message.stickerMessage?.mimetype
    || null

  const fileName = message.documentMessage?.fileName
    || (params.messageType === 'image' ? 'image.jpg'
      : params.messageType === 'video' ? 'video.mp4'
        : params.messageType === 'audio' ? 'audio.ogg'
          : null)

  // Prefer decrypted media via Evolution; Baileys CDN URLs are often unusable alone.
  try {
    let integration = params.integration || null
    if (!integration) {
      const { data } = await client
        .from('whatsapp_integration')
        .select('*')
        .eq('instance_id', params.instance.id)
        .maybeSingle()
      integration = data
    }

    if (integration) {
      const evoConfig = getEvolutionConfigFromIntegration(
        integration,
        getEvolutionInstanceName(params.instance),
      )
      if (evoConfig) {
        const media = await evolutionGetBase64FromMediaMessage(evoConfig, params.item)
        if (media?.base64) {
          const uploaded = await uploadWhatsAppMediaBase64(client, {
            tenantId: params.tenantId,
            conversationId: params.conversationId,
            externalId: params.externalId,
            base64: media.base64,
            mimeType: media.mimetype || mime,
            fileName: media.fileName || fileName,
          })
          if (uploaded) {
            return {
              mediaUrl: uploaded.mediaUrl,
              mediaMime: uploaded.mediaMime,
              fileName: uploaded.fileName,
            }
          }
        }
      }
    }
  }
  catch (error: any) {
    console.warn('[WhatsApp] Media download failed:', error?.message || error)
  }

  return {
    mediaUrl: directUrl,
    mediaMime: mime,
    fileName,
  }
}

async function mergeMessageReactions(
  client: SupabaseClient,
  params: {
    tenantId: string
    targetExternalId: string
    reaction: WhatsAppMessageReaction
  },
) {
  const { data: message } = await client
    .from('whatsapp_message')
    .select('id, reactions')
    .eq('tenant_id', params.tenantId)
    .eq('external_id', params.targetExternalId)
    .maybeSingle()

  if (!message?.id)
    return null

  const current = Array.isArray(message.reactions) ? [...message.reactions] as WhatsAppMessageReaction[] : []
  const filtered = current.filter((item) => {
    if (params.reaction.fromMe)
      return !item.fromMe
    return item.participantJid !== params.reaction.participantJid
  })

  // Empty emoji removes the previous reaction from that participant.
  if (params.reaction.emoji)
    filtered.push(params.reaction)

  const { data: updated } = await client
    .from('whatsapp_message')
    .update({ reactions: filtered, updated_at: new Date().toISOString() })
    .eq('id', message.id)
    .select('*')
    .maybeSingle()

  if (updated)
    await broadcastWhatsAppEvent(params.tenantId, 'message', updated)

  return updated
}

async function syncGroupFromPayload(
  client: SupabaseClient,
  params: {
    tenantId: string
    instanceId: string
    group: Record<string, any>
  },
) {
  const groupJid = normalizeWhatsAppJid(String(params.group.id || params.group.jid || params.group.remoteJid || ''))
  if (!isGroupJid(groupJid))
    return null

  const subject = String(params.group.subject || params.group.name || groupJid)
  const picture = params.group.pictureUrl || params.group.profilePictureUrl || null
  const conversationId = await findOrUpsertWhatsAppConversation(client, {
    tenantId: params.tenantId,
    instanceId: params.instanceId,
    contactPhone: normalizePhone(groupJid.replace(/@.*/, '')) || groupJid,
    contactName: subject,
    remoteJid: groupJid,
    isGroup: true,
    groupSubject: subject,
    profilePicture: picture,
    lastMessagePreview: '',
    lastMessageAt: new Date().toISOString(),
    fromMe: true,
  })

  await client
    .from('whatsapp_conversation')
    .update({
      group_metadata: {
        size: params.group.size ?? null,
        owner: params.group.owner ?? null,
        desc: params.group.desc ?? null,
        restrict: params.group.restrict ?? null,
        announce: params.group.announce ?? null,
      },
      group_subject: subject,
      profile_picture: picture,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  const participants = Array.isArray(params.group.participants) ? params.group.participants : []
  for (const participant of participants) {
    const participantJid = normalizeWhatsAppJid(String(participant.id || participant.jid || participant.phoneNumber || ''))
    if (!participantJid)
      continue
    const phone = normalizePhone(participantJid.replace(/@.*/, ''))
    const contactId = phone ? await upsertContact(client, params.tenantId, phone, participant.name) : null
    await upsertGroupParticipant(client, {
      tenantId: params.tenantId,
      conversationId,
      participantJid,
      phone,
      name: participant.name || phone || participantJid,
      adminRole: participant.admin || participant.adminRole || null,
      contactId,
    })
  }

  return conversationId
}

export async function processEvolutionWebhook(
  client: SupabaseClient,
  instance: Record<string, any>,
  payload: Record<string, any>,
  integration?: Record<string, any> | null,
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

  if (event === 'qrcode.updated') {
    const data = payload.data || payload
    const qr = String(data?.qrcode?.base64 || data?.base64 || data?.qrcode || '').trim()
    if (qr) {
      await client
        .from('whatsapp_instance')
        .update({
          qr_code: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`,
          status: 'connecting',
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId)
    }
    return { handled: true, type: 'qrcode' }
  }

  if (event === 'presence.update') {
    const data = payload.data || {}
    const remoteJid = resolveEvolutionRemoteJid({
      remoteJid: data.id || data.remoteJid || data.remoteJidAlt,
      remoteJidAlt: data.remoteJidAlt,
    })
    if (!shouldIgnoreEvolutionJid(remoteJid) && !isGroupJid(remoteJid)) {
      const presence = String(data.presences?.[remoteJid]?.lastKnownPresence
        || data.presence
        || data.lastKnownPresence
        || '').toLowerCase()
      const isOnline = ['available', 'composing', 'recording'].includes(presence)
      const { data: updated } = await client
        .from('whatsapp_conversation')
        .update({ is_online: isOnline, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('instance_id', instanceId)
        .eq('remote_jid', remoteJid)
        .select('*')
        .maybeSingle()

      if (updated)
        await broadcastWhatsAppEvent(tenantId, 'conversation', updated)
    }
    return { handled: true, type: 'presence' }
  }

  if (event === 'groups.upsert' || event === 'groups.update') {
    const groups = Array.isArray(payload.data) ? payload.data : [payload.data]
    for (const group of groups.filter(Boolean)) {
      await syncGroupFromPayload(client, { tenantId, instanceId, group })
    }
    return { handled: true, type: 'group' }
  }

  if (event === 'group.update.participants' || event === 'group.participants.update') {
    const data = payload.data || {}
    const groupJid = normalizeWhatsAppJid(String(data.groupJid || data.id || data.remoteJid || ''))
    if (isGroupJid(groupJid)) {
      const conversationId = await findOrUpsertWhatsAppConversation(client, {
        tenantId,
        instanceId,
        contactPhone: normalizePhone(groupJid.replace(/@.*/, '')) || groupJid,
        contactName: groupJid,
        remoteJid: groupJid,
        isGroup: true,
        groupSubject: data.subject || null,
        lastMessagePreview: '',
        lastMessageAt: new Date().toISOString(),
        fromMe: true,
      })

      const participants = Array.isArray(data.participants) ? data.participants : []
      for (const participant of participants) {
        const participantJid = normalizeWhatsAppJid(String(participant.id || participant || ''))
        if (!participantJid)
          continue
        const phone = normalizePhone(participantJid.replace(/@.*/, ''))
        const contactId = phone ? await upsertContact(client, tenantId, phone) : null
        await upsertGroupParticipant(client, {
          tenantId,
          conversationId,
          participantJid,
          phone,
          name: phone || participantJid,
          adminRole: participant.admin || null,
          contactId,
        })
      }
    }
    return { handled: true, type: 'group_participants' }
  }

  if (event === 'messages.upsert') {
    const messages = extractEvolutionMessages(payload)

    for (const item of messages) {
      if (!item?.key)
        continue

      const remoteJid = resolveEvolutionRemoteJid(item.key)
      if (shouldIgnoreEvolutionJid(remoteJid))
        continue

      const group = isGroupJid(remoteJid)
      const fromMe = Boolean(item.key.fromMe)
      const messageId = String(item.key.id || '').trim()
      if (!messageId)
        continue

      const messageType = detectMessageType(item.message, item.messageType)
      if (messageType === 'reaction' || item.message?.reactionMessage) {
        const reactionMsg = unwrapMessageContent(item.message).reactionMessage || item.message?.reactionMessage
        const targetId = String(reactionMsg?.key?.id || '').trim()
        const emoji = String(reactionMsg?.text || '')
        if (targetId) {
          await mergeMessageReactions(client, {
            tenantId,
            targetExternalId: targetId,
            reaction: {
              emoji,
              participantJid: resolveEvolutionParticipantJid(item.key) || remoteJid,
              fromMe,
            },
          })
        }
        continue
      }

      const { data: existingMsg } = await client
        .from('whatsapp_message')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('external_id', messageId)
        .maybeSingle()

      if (existingMsg?.id)
        continue

      const timestamp = item.messageTimestamp
        ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString()

      const text = extractMessageText(item.message)
      const quotedExternalId = extractQuotedExternalId(item.message)
      const participantJid = group ? resolveEvolutionParticipantJid(item.key) : null
      const pushName = String(item.pushName || '')
      const phone = group
        ? (normalizePhone(remoteJid.replace(/@.*/, '')) || remoteJid)
        : normalizePhone(remoteJid)

      let contactId: string | null = null
      if (!group) {
        contactId = await upsertContact(client, tenantId, phone, pushName || phone)
      }
      else if (participantJid) {
        const participantPhone = normalizePhone(participantJid.replace(/@.*/, ''))
        if (participantPhone)
          contactId = await upsertContact(client, tenantId, participantPhone, pushName || participantPhone)
      }

      const referral = !fromMe && !group
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

      const conversationId = await findOrUpsertWhatsAppConversation(client, {
        tenantId,
        instanceId,
        contactId,
        remoteJid,
        contactName: group ? (pushName || phone) : (pushName || phone),
        contactPhone: phone,
        isGroup: group,
        groupSubject: group ? (item.groupSubject || item.subject || null) : null,
        lastMessagePreview: text || '[mídia]',
        lastMessageAt: timestamp,
        fromMe,
      })

      if (group && participantJid) {
        await upsertGroupParticipant(client, {
          tenantId,
          conversationId,
          participantJid,
          phone: normalizePhone(participantJid.replace(/@.*/, '')),
          name: pushName || normalizePhone(participantJid.replace(/@.*/, '')) || participantJid,
          contactId,
        })
      }

      let replyToId: string | null = null
      if (quotedExternalId) {
        const { data: quoted } = await client
          .from('whatsapp_message')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('external_id', quotedExternalId)
          .maybeSingle()
        replyToId = quoted?.id || null
      }

      const media = ['image', 'video', 'audio', 'document', 'sticker'].includes(messageType)
        ? await resolveInboundMedia(client, {
            instance,
            integration,
            tenantId,
            conversationId,
            externalId: messageId,
            item,
            messageType,
          })
        : { mediaUrl: null, mediaMime: null, fileName: null }

      const { data: inserted } = await client.from('whatsapp_message').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        instance_id: instanceId,
        contact_id: contactId,
        external_id: messageId,
        remote_jid: remoteJid,
        from_me: fromMe,
        message_type: messageType,
        content: text,
        media_url: media.mediaUrl,
        media_mime: media.mediaMime,
        file_name: media.fileName,
        status: fromMe ? 'sent' : 'delivered',
        sent_at: timestamp,
        reply_to_id: replyToId,
        quoted_external_id: quotedExternalId,
        participant_jid: participantJid,
        participant_name: group ? (pushName || null) : null,
        reactions: [],
        metadata,
      }).select('*').single()

      if (inserted) {
        await broadcastWhatsAppEvent(tenantId, 'message', inserted)

        if (!fromMe && !group && contactId) {
          try {
            await dispatchInboundAutomation(client, {
              tenantId,
              instanceId,
              contactId,
              conversationId,
              remoteJid,
              messageId: inserted.id as string,
              messageContent: text,
              messageType,
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
      const messageId = String(item?.key?.id || item?.messageId || '').trim()
      if (!messageId)
        continue

      const reactionUpdate = item?.update?.reactionMessage || item?.reactionMessage
      if (reactionUpdate) {
        await mergeMessageReactions(client, {
          tenantId,
          targetExternalId: String(reactionUpdate.key?.id || messageId),
          reaction: {
            emoji: String(reactionUpdate.text || ''),
            participantJid: resolveEvolutionParticipantJid(item?.key || {}) || null,
            fromMe: Boolean(item?.key?.fromMe),
          },
        })
        continue
      }

      const mappedStatus = mapEvolutionMessageStatus(item?.update?.status ?? item?.status)
      if (!mappedStatus)
        continue

      const patch: Record<string, unknown> = {
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      }
      if (mappedStatus === 'delivered')
        patch.delivered_at = new Date().toISOString()
      if (mappedStatus === 'read')
        patch.read_at = new Date().toISOString()

      const { data: updated } = await client
        .from('whatsapp_message')
        .update(patch)
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

    if (existingMsg?.id)
      continue

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
      reactions: [],
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
        reactions: [],
        metadata,
      }).select('*').single()

      if (inserted)
        await broadcastWhatsAppEvent(tenantId, 'message', inserted)
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
