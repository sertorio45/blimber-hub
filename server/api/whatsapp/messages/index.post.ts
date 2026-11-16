import { createError, readBody } from 'h3'

import { serverSupabaseServiceRole } from '#supabase/server'

import { mapMessageRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'
import { isGroupJid } from '~/server/utils/whatsapp/conversation-utils'
import { loadInstanceWithIntegration } from '~/server/utils/whatsapp/instance-loader'
import {
  sendWhatsAppMediaMessage,
  sendWhatsAppReaction,
  sendWhatsAppTextMessage,
} from '~/server/utils/whatsapp/message-sender'
import { broadcastWhatsAppEvent } from '~/server/utils/whatsapp/realtime-broadcast'

import type { EvolutionQuotedMessage } from '~/server/utils/whatsapp/evolution-client'

interface SendMessageBody {
  tenant_id?: string
  conversation_id: string
  content?: string
  reply_to_id?: string | null
  type?: 'text' | 'media' | 'reaction'
  media?: {
    mediatype: 'image' | 'video' | 'audio' | 'document'
    url: string
    caption?: string
    fileName?: string
  }
  reaction?: {
    message_id: string
    emoji: string
  }
}

async function buildQuotedPayload(
  client: ReturnType<typeof serverSupabaseServiceRole>,
  tenantId: string,
  replyToId?: string | null,
): Promise<{ quoted: EvolutionQuotedMessage | null, replyToId: string | null }> {
  if (!replyToId)
    return { quoted: null, replyToId: null }

  const { data: quotedMessage } = await client
    .from('whatsapp_message')
    .select('id, external_id, remote_jid, from_me, content')
    .eq('id', replyToId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!quotedMessage?.external_id)
    return { quoted: null, replyToId: quotedMessage?.id || replyToId }

  return {
    replyToId: quotedMessage.id,
    quoted: {
      key: {
        id: quotedMessage.external_id,
        remoteJid: quotedMessage.remote_jid,
        fromMe: Boolean(quotedMessage.from_me),
      },
      message: {
        conversation: quotedMessage.content || '',
      },
    },
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SendMessageBody>(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, body.tenant_id)

  if (!body.conversation_id)
    throw createError({ statusCode: 400, statusMessage: 'conversation_id is required' })

  const client = serverSupabaseServiceRole(event)

  const { data: conversation, error: convError } = await client
    .from('whatsapp_conversation')
    .select('*')
    .eq('id', body.conversation_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (convError || !conversation)
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  if (!conversation.instance_id) {
    const { data: instances } = await client
      .from('whatsapp_instance')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'connected')
      .order('is_default', { ascending: false })
      .limit(1)

    const fallbackInstance = instances?.[0]
    if (!fallbackInstance?.id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nenhuma instância WhatsApp conectada',
      })
    }

    conversation.instance_id = fallbackInstance.id
    await client
      .from('whatsapp_conversation')
      .update({ instance_id: fallbackInstance.id })
      .eq('id', conversation.id)
  }

  const { instance, integration } = await loadInstanceWithIntegration(event, conversation.instance_id)

  if (instance.status !== 'connected') {
    throw createError({ statusCode: 400, statusMessage: 'WhatsApp instance is not connected' })
  }

  if (!integration)
    throw createError({ statusCode: 400, statusMessage: 'Integration not configured' })

  const phone = conversation.contact_phone || conversation.remote_jid.replace(/@.*/, '')
  const remoteJid = conversation.remote_jid
  const now = new Date().toISOString()
  const sendType = body.type || (body.reaction ? 'reaction' : body.media ? 'media' : 'text')

  if (sendType === 'reaction') {
    if (!body.reaction?.message_id)
      throw createError({ statusCode: 400, statusMessage: 'reaction.message_id is required' })

    const { data: target } = await client
      .from('whatsapp_message')
      .select('*')
      .eq('id', body.reaction.message_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!target?.external_id)
      throw createError({ statusCode: 404, statusMessage: 'Target message not found' })

    try {
      await sendWhatsAppReaction({
        instance,
        integration,
        remoteJid: target.remote_jid || remoteJid,
        messageId: target.external_id,
        fromMe: Boolean(target.from_me),
        reaction: body.reaction.emoji || '',
      })
    }
    catch (error: any) {
      throw createError({
        statusCode: 400,
        statusMessage: error?.data?.message || error?.message || 'Failed to send reaction',
      })
    }

    const current = Array.isArray(target.reactions) ? [...target.reactions] : []
    const withoutMine = current.filter((item: any) => !item?.fromMe)
    if (body.reaction.emoji)
      withoutMine.push({ emoji: body.reaction.emoji, fromMe: true, participantJid: null })

    const { data: updated } = await client
      .from('whatsapp_message')
      .update({ reactions: withoutMine, updated_at: now })
      .eq('id', target.id)
      .select('*')
      .single()

    if (updated)
      await broadcastWhatsAppEvent(tenantId, 'message', updated)

    return { data: mapMessageRow(updated as any) }
  }

  const { quoted, replyToId } = await buildQuotedPayload(client, tenantId, body.reply_to_id)
  let externalId: string | null = null
  let messageType = 'text'
  let content = body.content?.trim() || ''
  let mediaUrl: string | null = null
  let mediaMime: string | null = null
  let fileName: string | null = null

  try {
    if (sendType === 'media') {
      if (!body.media?.url || !body.media?.mediatype) {
        throw createError({ statusCode: 400, statusMessage: 'media.url and media.mediatype are required' })
      }

      messageType = body.media.mediatype
      content = body.media.caption || content || ''
      mediaUrl = body.media.url
      fileName = body.media.fileName || null

      const providerResult = await sendWhatsAppMediaMessage({
        instance,
        integration,
        phone,
        remoteJid,
        mediatype: body.media.mediatype,
        mediaUrl: body.media.url,
        caption: content || undefined,
        fileName: body.media.fileName,
        quoted: quoted || undefined,
      }) as any

      externalId = providerResult?.key?.id || providerResult?.messages?.[0]?.id || null
    }
    else {
      if (!content)
        throw createError({ statusCode: 400, statusMessage: 'content is required' })

      const providerResult = await sendWhatsAppTextMessage({
        instance,
        integration,
        phone,
        text: content,
        remoteJid,
        quoted: quoted || undefined,
      }) as any

      externalId = providerResult?.key?.id || providerResult?.messages?.[0]?.id || null
    }
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error?.data?.message || error?.message || 'Failed to send message',
    })
  }

  const { data: message, error: msgError } = await client
    .from('whatsapp_message')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversation.id,
      instance_id: instance.id,
      contact_id: isGroupJid(remoteJid) ? null : conversation.contact_id,
      external_id: externalId,
      remote_jid: remoteJid,
      from_me: true,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      media_mime: mediaMime,
      file_name: fileName,
      status: 'sent',
      sent_at: now,
      reply_to_id: replyToId,
      quoted_external_id: quoted?.key.id || null,
      reactions: [],
    })
    .select('*')
    .single()

  if (msgError)
    throw createError({ statusCode: 400, statusMessage: msgError.message })

  const preview = content || (messageType !== 'text' ? `[${messageType}]` : '')
  const { data: updatedConversation } = await client
    .from('whatsapp_conversation')
    .update({
      last_message_preview: preview,
      last_message_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id)
    .select('*')
    .single()

  await broadcastWhatsAppEvent(tenantId, 'message', message as any)
  if (updatedConversation)
    await broadcastWhatsAppEvent(tenantId, 'conversation', updatedConversation as any)

  return { data: mapMessageRow(message as any) }
})
