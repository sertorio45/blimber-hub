import { decryptSecret } from '~/server/utils/marketing'

export interface EvolutionClientConfig {
  baseUrl: string
  apiToken: string
  instanceName: string
}

export interface EvolutionQuotedMessage {
  key: {
    id: string
    remoteJid?: string
    fromMe?: boolean
  }
  message?: {
    conversation?: string
  }
}

const CORE_WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
] as const

const EXTENDED_WEBHOOK_EVENTS = [
  ...CORE_WEBHOOK_EVENTS,
  'GROUPS_UPSERT',
  'GROUP_UPDATE_PARTICIPANTS',
  'PRESENCE_UPDATE',
  'QRCODE_UPDATED',
] as const

export const DEFAULT_WEBHOOK_EVENTS = EXTENDED_WEBHOOK_EVENTS

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

async function evolutionFetch<T>(
  config: EvolutionClientConfig,
  path: string,
  options: { method?: string, body?: unknown, query?: Record<string, string | boolean | number | undefined> } = {},
): Promise<T> {
  const query = options.query
    ? `?${Object.entries(options.query)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')}`
    : ''

  const url = `${normalizeBaseUrl(config.baseUrl)}${path}${query}`
  return $fetch<T>(url, {
    method: options.method || 'GET',
    headers: {
      apikey: config.apiToken,
      'Content-Type': 'application/json',
    },
    body: options.body,
  })
}

function buildEvolutionWebhookBody(
  webhookUrl: string,
  webhookSecret?: string | null,
  events: readonly string[] = DEFAULT_WEBHOOK_EVENTS,
) {
  const webhook: Record<string, unknown> = {
    url: webhookUrl,
    enabled: true,
    // Evolution API v2
    byEvents: false,
    // Legacy Evolution builds
    webhookByEvents: false,
    events: [...events],
  }

  if (webhookSecret) {
    webhook.headers = {
      'x-webhook-secret': webhookSecret,
    }
  }

  return { webhook }
}

function extractConfiguredWebhookUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object')
    return null

  const record = raw as Record<string, unknown>
  const nested = record.webhook as Record<string, unknown> | undefined
  const url = String(nested?.url || record.url || '').trim()
  return url || null
}

function isConfiguredWebhookEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object')
    return false

  const record = raw as Record<string, unknown>
  const nested = record.webhook as Record<string, unknown> | undefined
  if (nested?.enabled === false)
    return false
  if (record.enabled === false)
    return false
  return true
}

export async function evolutionFindWebhook(
  config: EvolutionClientConfig,
): Promise<Record<string, unknown> | null> {
  try {
    return await evolutionFetch<Record<string, unknown>>(
      config,
      `/webhook/find/${encodeURIComponent(config.instanceName)}`,
    )
  }
  catch {
    return null
  }
}

/**
 * Registers webhook only when missing or URL differs.
 * Avoids Evolution API P2002 duplicate webhook rows (set after create).
 * Falls back to core events when extended events are rejected by older builds.
 */
export async function evolutionEnsureWebhook(
  config: EvolutionClientConfig,
  webhookUrl: string,
  options?: { webhookSecret?: string | null, force?: boolean },
): Promise<{ configured: boolean, skipped: boolean, reason?: string, events?: string[] }> {
  const targetUrl = webhookUrl.trim()
  if (!targetUrl)
    throw new Error('Webhook URL is required')

  if (!options?.force) {
    const current = await evolutionFindWebhook(config)
    const currentUrl = extractConfiguredWebhookUrl(current)
    if (currentUrl === targetUrl && isConfiguredWebhookEnabled(current)) {
      return { configured: true, skipped: true, reason: 'already_configured' }
    }
  }

  try {
    await evolutionSetWebhook(config, targetUrl, options?.webhookSecret, DEFAULT_WEBHOOK_EVENTS)
    return { configured: true, skipped: false, events: [...DEFAULT_WEBHOOK_EVENTS] }
  }
  catch (error: any) {
    // Older Evolution builds may reject unknown webhook event names.
    await evolutionSetWebhook(config, targetUrl, options?.webhookSecret, CORE_WEBHOOK_EVENTS)
    return {
      configured: true,
      skipped: false,
      reason: error?.message || 'fallback_core_events',
      events: [...CORE_WEBHOOK_EVENTS],
    }
  }
}

export async function evolutionCreateInstance(
  config: Omit<EvolutionClientConfig, 'instanceName'> & { instanceName: string },
  webhookUrl?: string,
  webhookSecret?: string | null,
) {
  const body: Record<string, unknown> = {
    instanceName: config.instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  }

  if (webhookUrl) {
    Object.assign(body, buildEvolutionWebhookBody(webhookUrl, webhookSecret))
  }

  return evolutionFetch(config, '/instance/create', { method: 'POST', body })
}

export async function evolutionConnect(config: EvolutionClientConfig) {
  return evolutionFetch<{ base64?: string, code?: string, pairingCode?: string }>(
    config,
    `/instance/connect/${encodeURIComponent(config.instanceName)}`,
  )
}

export async function evolutionConnectionState(config: EvolutionClientConfig) {
  return evolutionFetch<{ instance?: { state?: string }, state?: string }>(
    config,
    `/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
  )
}

export async function evolutionLogout(config: EvolutionClientConfig) {
  return evolutionFetch(config, `/instance/logout/${encodeURIComponent(config.instanceName)}`, {
    method: 'DELETE',
  })
}

export async function evolutionDeleteInstance(config: EvolutionClientConfig) {
  return evolutionFetch(config, `/instance/delete/${encodeURIComponent(config.instanceName)}`, {
    method: 'DELETE',
  })
}

export async function evolutionSetWebhook(
  config: EvolutionClientConfig,
  webhookUrl: string,
  webhookSecret?: string | null,
  events: readonly string[] = DEFAULT_WEBHOOK_EVENTS,
) {
  return evolutionFetch(config, `/webhook/set/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: buildEvolutionWebhookBody(webhookUrl, webhookSecret, events),
  })
}

export async function evolutionSendText(
  config: EvolutionClientConfig,
  payload: {
    number: string
    text: string
    quoted?: EvolutionQuotedMessage
    delay?: number
    mentioned?: string[]
    mentionsEveryOne?: boolean
  },
) {
  return evolutionFetch(config, `/message/sendText/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: {
      number: payload.number,
      text: payload.text,
      quoted: payload.quoted || undefined,
      delay: payload.delay || undefined,
      mentioned: payload.mentioned || undefined,
      mentionsEveryOne: payload.mentionsEveryOne || undefined,
    },
  })
}

export async function evolutionSendMedia(
  config: EvolutionClientConfig,
  payload: {
    number: string
    mediatype: 'image' | 'video' | 'audio' | 'document'
    media: string
    caption?: string
    fileName?: string
    quoted?: EvolutionQuotedMessage
  },
) {
  return evolutionFetch(config, `/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: {
      number: payload.number,
      mediatype: payload.mediatype,
      media: payload.media,
      caption: payload.caption || undefined,
      fileName: payload.fileName || undefined,
      quoted: payload.quoted || undefined,
    },
  })
}

export async function evolutionSendReaction(
  config: EvolutionClientConfig,
  payload: {
    key: { id: string, remoteJid: string, fromMe: boolean }
    reaction: string
  },
) {
  return evolutionFetch(config, `/message/sendReaction/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: {
      key: payload.key,
      reaction: payload.reaction,
    },
  })
}

export async function evolutionMarkMessageAsRead(
  config: EvolutionClientConfig,
  readMessages: Array<{ id: string, fromMe: boolean, remoteJid: string }>,
) {
  return evolutionFetch(config, `/chat/markMessageAsRead/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: { readMessages },
  })
}

export async function evolutionSendPresence(
  config: EvolutionClientConfig,
  payload: {
    number: string
    presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
    delay?: number
  },
) {
  return evolutionFetch(config, `/chat/sendPresence/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: {
      number: payload.number,
      presence: payload.presence,
      delay: payload.delay ?? 5000,
    },
  })
}

export async function evolutionGetBase64FromMediaMessage(
  config: EvolutionClientConfig,
  message: Record<string, unknown>,
  options?: { convertToMp4?: boolean },
) {
  return evolutionFetch<{ base64?: string, mimetype?: string, fileName?: string }>(
    config,
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instanceName)}`,
    {
      method: 'POST',
      body: {
        message,
        convertToMp4: options?.convertToMp4 ?? false,
      },
    },
  )
}

export async function evolutionFetchAllGroups(
  config: EvolutionClientConfig,
  getParticipants = true,
) {
  return evolutionFetch<Record<string, unknown>[]>(
    config,
    `/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}`,
    { query: { getParticipants } },
  )
}

export async function evolutionFindGroupInfos(
  config: EvolutionClientConfig,
  groupJid: string,
) {
  return evolutionFetch<Record<string, unknown>>(
    config,
    `/group/findGroupInfos/${encodeURIComponent(config.instanceName)}`,
    { query: { groupJid } },
  )
}

export function getEvolutionConfigFromIntegration(
  integration: Record<string, any>,
  instanceName: string,
): EvolutionClientConfig | null {
  const baseUrl = integration.api_url as string | undefined
  const apiToken = decryptSecret(integration.api_token_encrypted)
  if (!baseUrl || !apiToken)
    return null

  return { baseUrl, apiToken, instanceName }
}

export function mapEvolutionConnectionState(raw: Record<string, unknown>): {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  phoneNumber?: string
} {
  const instance = (raw.instance || raw) as Record<string, unknown>
  const state = String(
    instance?.state
    || instance?.status
    || raw.state
    || (raw as any).connection
    || 'close',
  ).toLowerCase()

  const owner = String(instance?.owner || instance?.wuid || (raw as any).phoneNumber || '')
  const phoneNumber = owner
    ? owner.replace(/@.*/, '').replace(/\D/g, '') || undefined
    : undefined

  if (['open', 'connected'].includes(state)) {
    return { status: 'connected', phoneNumber }
  }
  if (['connecting', 'pairing'].includes(state))
    return { status: 'connecting', phoneNumber }

  return { status: 'disconnected', phoneNumber }
}

export interface EvolutionRemoteInstance {
  instanceName: string
  status: string
  phoneNumber?: string | null
  isConnected: boolean
}

function parseEvolutionRemoteInstance(raw: Record<string, unknown>): EvolutionRemoteInstance | null {
  const instance = (raw.instance || raw) as Record<string, unknown>
  const instanceName = String(instance.instanceName || instance.name || '').trim()
  if (!instanceName)
    return null

  const state = String(
    instance.status
    || instance.state
    || raw.state
    || 'close',
  ).toLowerCase()

  const owner = String(instance.owner || instance.number || '')
  const phoneNumber = owner
    ? owner.replace(/@.*/, '').replace(/\D/g, '') || null
    : null

  return {
    instanceName,
    status: state,
    phoneNumber,
    isConnected: ['open', 'connected'].includes(state),
  }
}

export async function evolutionFetchInstances(
  config: Omit<EvolutionClientConfig, 'instanceName'>,
): Promise<EvolutionRemoteInstance[]> {
  const raw = await evolutionFetch<unknown>(
    { ...config, instanceName: '_' },
    '/instance/fetchInstances',
  )

  const list = Array.isArray(raw)
    ? raw
    : (raw as { instances?: unknown[], data?: unknown[] })?.instances
      || (raw as { data?: unknown[] })?.data
      || []

  return list
    .map((item: Record<string, unknown>) => parseEvolutionRemoteInstance(item))
    .filter((item): item is EvolutionRemoteInstance => item !== null)
}

export async function resolveEvolutionRemoteInstance(
  config: Omit<EvolutionClientConfig, 'instanceName'>,
  instanceName: string,
): Promise<EvolutionRemoteInstance> {
  const instances = await evolutionFetchInstances(config)
  const found = instances.find(item => item.instanceName === instanceName)
  if (found)
    return found

  try {
    const raw = await evolutionConnectionState({ ...config, instanceName })
    const mapped = mapEvolutionConnectionState(raw as Record<string, unknown>)
    return {
      instanceName,
      status: mapped.status === 'connected' ? 'open' : mapped.status,
      phoneNumber: mapped.phoneNumber || null,
      isConnected: mapped.status === 'connected',
    }
  }
  catch {
    throw new Error(`Instância "${instanceName}" não encontrada na Evolution API`)
  }
}

export async function syncEvolutionInstanceRecord(
  client: { from: (table: string) => any },
  instanceId: string,
  evoConfig: EvolutionClientConfig,
  options: { currentQrCode?: string | null } = {},
) {
  const raw = await evolutionConnectionState(evoConfig)
  const mapped = mapEvolutionConnectionState(raw as Record<string, unknown>)

  await client
    .from('whatsapp_instance')
    .update({
      status: mapped.status,
      phone_number: mapped.phoneNumber || null,
      connection_state: raw,
      qr_code: mapped.status === 'connected' ? null : options.currentQrCode ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instanceId)

  return mapped
}
