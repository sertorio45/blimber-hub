import { createError } from 'h3'

import { WHATSAPP_CLOUD_API_ENABLED } from '~/constants/whatsapp'
import {
  cloudApiSendText,
  getCloudApiConfigFromIntegration,
} from '~/server/utils/whatsapp/cloud-api-client'
import {
  isGroupJid,
  normalizeWhatsAppJid,
} from '~/server/utils/whatsapp/conversation-utils'
import {
  evolutionSendMedia,
  evolutionSendPresence,
  evolutionSendReaction,
  evolutionSendText,
  getEvolutionConfigFromIntegration,
  type EvolutionQuotedMessage,
} from '~/server/utils/whatsapp/evolution-client'
import { getEvolutionInstanceName } from '~/server/utils/whatsapp/instance-loader'

function resolveEvolutionNumber(phone: string, remoteJid?: string): string {
  const jid = normalizeWhatsAppJid(remoteJid || '')
  if (isGroupJid(jid))
    return jid

  if (jid.endsWith('@s.whatsapp.net'))
    return jid.replace(/@.*/, '')

  const fromPhone = phone.replace(/\D/g, '')
  if (fromPhone.length >= 10)
    return fromPhone

  const fromJid = String(remoteJid || '').replace(/@.*/, '').replace(/\D/g, '')
  if (fromJid.length >= 10)
    return fromJid

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid WhatsApp number for send',
  })
}

function requireEvolutionConfig(instance: Record<string, any>, integration: Record<string, any>) {
  const evoConfig = getEvolutionConfigFromIntegration(
    integration,
    getEvolutionInstanceName(instance),
  )
  if (!evoConfig)
    throw createError({ statusCode: 400, statusMessage: 'Evolution API not configured' })
  return evoConfig
}

export async function sendWhatsAppTextMessage(params: {
  instance: Record<string, any>
  integration: Record<string, any>
  phone: string
  text: string
  remoteJid?: string
  quoted?: EvolutionQuotedMessage
}) {
  const { instance, integration, phone, remoteJid, quoted } = params
  const normalizedPhone = phone.replace(/\D/g, '')

  if (!integration) {
    throw createError({
      statusCode: 400,
      statusMessage: 'WhatsApp integration not configured for this instance',
    })
  }

  if (instance.provider === 'evolution') {
    const evoConfig = requireEvolutionConfig(instance, integration)
    const recipient = resolveEvolutionNumber(phone, remoteJid)
    return evolutionSendText(evoConfig, {
      number: recipient,
      text: params.text,
      quoted,
    })
  }

  if (instance.provider === 'cloud_api') {
    if (!WHATSAPP_CLOUD_API_ENABLED) {
      throw createError({
        statusCode: 503,
        statusMessage: 'WhatsApp Cloud API oficial estará disponível em breve.',
      })
    }

    const cloudConfig = getCloudApiConfigFromIntegration(integration)
    if (!cloudConfig)
      throw createError({ statusCode: 400, statusMessage: 'Cloud API not configured' })

    return cloudApiSendText(cloudConfig, { to: normalizedPhone, text: params.text })
  }

  throw createError({ statusCode: 400, statusMessage: 'Unsupported provider' })
}

export async function sendWhatsAppMediaMessage(params: {
  instance: Record<string, any>
  integration: Record<string, any>
  phone: string
  remoteJid?: string
  mediatype: 'image' | 'video' | 'audio' | 'document'
  mediaUrl: string
  caption?: string
  fileName?: string
  quoted?: EvolutionQuotedMessage
}) {
  const { instance, integration, phone, remoteJid, quoted } = params

  if (!integration) {
    throw createError({
      statusCode: 400,
      statusMessage: 'WhatsApp integration not configured for this instance',
    })
  }

  if (instance.provider !== 'evolution') {
    throw createError({ statusCode: 400, statusMessage: 'Media messages require Evolution provider' })
  }

  const evoConfig = requireEvolutionConfig(instance, integration)
  const recipient = resolveEvolutionNumber(phone, remoteJid)
  return evolutionSendMedia(evoConfig, {
    number: recipient,
    mediatype: params.mediatype,
    media: params.mediaUrl,
    caption: params.caption,
    fileName: params.fileName,
    quoted,
  })
}

export async function sendWhatsAppReaction(params: {
  instance: Record<string, any>
  integration: Record<string, any>
  remoteJid: string
  messageId: string
  fromMe: boolean
  reaction: string
}) {
  if (params.instance.provider !== 'evolution') {
    throw createError({ statusCode: 400, statusMessage: 'Reactions require Evolution provider' })
  }

  const evoConfig = requireEvolutionConfig(params.instance, params.integration)
  return evolutionSendReaction(evoConfig, {
    key: {
      id: params.messageId,
      remoteJid: normalizeWhatsAppJid(params.remoteJid),
      fromMe: params.fromMe,
    },
    reaction: params.reaction,
  })
}

export async function sendWhatsAppPresence(params: {
  instance: Record<string, any>
  integration: Record<string, any>
  phone: string
  remoteJid?: string
  presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
  delay?: number
}) {
  if (params.instance.provider !== 'evolution') {
    throw createError({ statusCode: 400, statusMessage: 'Presence requires Evolution provider' })
  }

  const evoConfig = requireEvolutionConfig(params.instance, params.integration)
  const recipient = resolveEvolutionNumber(params.phone, params.remoteJid)
  return evolutionSendPresence(evoConfig, {
    number: recipient,
    presence: params.presence,
    delay: params.delay,
  })
}
