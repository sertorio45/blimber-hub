import type { SupabaseClient } from '@supabase/supabase-js'

import { normalizePhone } from '~/server/utils/whatsapp/contact-utils'
import { broadcastWhatsAppEvent } from '~/server/utils/whatsapp/realtime-broadcast'

import type { WhatsAppConversationStatus } from '~/types/whatsapp'

export const ACTIVE_WHATSAPP_CONVERSATION_STATUSES: WhatsAppConversationStatus[] = ['open', 'pending']

export function isActiveWhatsAppConversationStatus(status: string | null | undefined): boolean {
  return ACTIVE_WHATSAPP_CONVERSATION_STATUSES.includes(status as WhatsAppConversationStatus)
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return String(jid || '').endsWith('@g.us')
}

export function isBroadcastJid(jid: string | null | undefined): boolean {
  const value = String(jid || '')
  return value.includes('status@broadcast') || value.endsWith('@broadcast')
}

/**
 * Preserve WhatsApp JID server suffixes. Never rewrite @g.us into a DM JID.
 */
export function normalizeWhatsAppJid(raw: string | null | undefined): string {
  const value = String(raw || '').trim()
  if (!value)
    return ''

  if (value.includes('@')) {
    const [userPart, serverPartRaw] = value.split('@')
    const serverPart = String(serverPartRaw || '').toLowerCase()
    if (serverPart === 'g.us')
      return `${userPart}@g.us`
    if (serverPart === 's.whatsapp.net')
      return `${userPart.replace(/\D/g, '') || userPart}@s.whatsapp.net`
    if (serverPart === 'lid')
      return `${userPart}@lid`
    if (serverPart.includes('broadcast'))
      return value
    return `${userPart}@${serverPart}`
  }

  const phone = normalizePhone(value)
  return phone ? `${phone}@s.whatsapp.net` : value
}

export function buildWhatsAppRemoteJid(phoneOrJid: string): string {
  return normalizeWhatsAppJid(phoneOrJid)
}

/**
 * Resolve chat JID from an Evolution message key.
 * Groups: keep @g.us from remoteJid.
 * DMs: prefer remoteJidAlt (phone) when LID is present.
 */
export function resolveEvolutionRemoteJid(key: Record<string, unknown>): string {
  const remoteJid = normalizeWhatsAppJid(String(key.remoteJid || ''))
  if (isGroupJid(remoteJid))
    return remoteJid

  const alt = normalizeWhatsAppJid(String(key.remoteJidAlt || ''))
  if (alt && !isGroupJid(alt) && !alt.endsWith('@lid'))
    return alt

  if (remoteJid)
    return remoteJid

  return alt
}

export function resolveEvolutionParticipantJid(key: Record<string, unknown>): string | null {
  const participant = normalizeWhatsAppJid(String(key.participant || key.participantAlt || ''))
  if (!participant || isGroupJid(participant) || isBroadcastJid(participant))
    return null
  return participant
}

interface UpsertConversationParams {
  tenantId: string
  instanceId: string
  contactId?: string | null
  contactPhone: string
  contactName: string
  remoteJid?: string
  isGroup?: boolean
  groupSubject?: string | null
  profilePicture?: string | null
  lastMessagePreview: string
  lastMessageAt: string
  fromMe: boolean
}

export async function findOrUpsertWhatsAppConversation(
  client: SupabaseClient,
  params: UpsertConversationParams,
): Promise<string> {
  const isGroup = Boolean(params.isGroup || isGroupJid(params.remoteJid))
  const remoteJid = normalizeWhatsAppJid(params.remoteJid || params.contactPhone)
  const phone = isGroup
    ? (normalizePhone(remoteJid.replace(/@.*/, '')) || params.contactPhone || remoteJid)
    : normalizePhone(params.contactPhone || remoteJid)
  const now = new Date().toISOString()

  let existing: { id: string, unread_count?: number | null } | null = null

  if (remoteJid) {
    const { data } = await client
      .from('whatsapp_conversation')
      .select('id, unread_count')
      .eq('tenant_id', params.tenantId)
      .eq('instance_id', params.instanceId)
      .eq('remote_jid', remoteJid)
      .maybeSingle()
    existing = data
  }

  if (!existing && !isGroup && phone) {
    const { data } = await client
      .from('whatsapp_conversation')
      .select('id, unread_count')
      .eq('tenant_id', params.tenantId)
      .eq('instance_id', params.instanceId)
      .eq('contact_phone', phone)
      .maybeSingle()
    existing = data
  }

  const unreadCount = existing
    ? (params.fromMe ? (existing.unread_count ?? 0) : (existing.unread_count ?? 0) + 1)
    : (params.fromMe ? 0 : 1)

  const displayName = isGroup
    ? (params.groupSubject || params.contactName || phone || remoteJid)
    : (params.contactName || phone)

  const payload: Record<string, unknown> = {
    instance_id: params.instanceId,
    contact_id: isGroup ? null : (params.contactId || null),
    contact_name: displayName,
    contact_phone: phone,
    remote_jid: remoteJid,
    is_group: isGroup,
    group_subject: isGroup ? (params.groupSubject || displayName) : null,
    unread_count: unreadCount,
    updated_at: now,
  }

  // Avoid wiping last message when syncing group metadata without a new message.
  if (params.lastMessagePreview) {
    payload.last_message_preview = params.lastMessagePreview
    payload.last_message_at = params.lastMessageAt
  }
  else if (!existing) {
    payload.last_message_preview = ''
    payload.last_message_at = params.lastMessageAt
  }

  if (params.profilePicture !== undefined)
    payload.profile_picture = params.profilePicture

  if (existing?.id) {
    // Do not bump unread when only refreshing metadata (empty preview sync).
    if (!params.lastMessagePreview)
      delete payload.unread_count

    const { data: updated } = await client
      .from('whatsapp_conversation')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updated)
      await broadcastWhatsAppEvent(params.tenantId, 'conversation', updated)

    return existing.id as string
  }

  const { data: created, error } = await client
    .from('whatsapp_conversation')
    .insert({
      tenant_id: params.tenantId,
      ...payload,
      status: 'open',
      channel: 'whatsapp',
      is_online: false,
      group_metadata: {},
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    const { data: retry } = await client
      .from('whatsapp_conversation')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('instance_id', params.instanceId)
      .eq('remote_jid', remoteJid)
      .maybeSingle()

    if (retry?.id) {
      const { data: updated } = await client
        .from('whatsapp_conversation')
        .update(payload)
        .eq('id', retry.id)
        .select('*')
        .single()

      if (updated)
        await broadcastWhatsAppEvent(params.tenantId, 'conversation', updated)

      return retry.id as string
    }
  }

  if (error)
    throw error

  if (created)
    await broadcastWhatsAppEvent(params.tenantId, 'conversation', created)

  return created!.id as string
}

export async function upsertGroupParticipant(
  client: SupabaseClient,
  params: {
    tenantId: string
    conversationId: string
    participantJid: string
    phone?: string | null
    name?: string | null
    adminRole?: string | null
    contactId?: string | null
  },
) {
  const jid = normalizeWhatsAppJid(params.participantJid)
  if (!jid)
    return null

  const phone = params.phone || normalizePhone(jid.replace(/@.*/, '')) || null
  const now = new Date().toISOString()

  const { data, error } = await client
    .from('whatsapp_group_participant')
    .upsert({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      participant_jid: jid,
      phone,
      name: params.name || phone || jid,
      admin_role: params.adminRole || null,
      contact_id: params.contactId || null,
      updated_at: now,
    }, { onConflict: 'conversation_id,participant_jid' })
    .select('*')
    .single()

  if (error)
    throw error

  return data
}

export function dedupeConversationRows<T extends {
  id?: string | null
  instance_id?: string | null
  contact_phone?: string | null
  remote_jid?: string | null
  last_message_at?: string | null
  created_at?: string | null
}>(
  rows: T[],
): T[] {
  const byKey = new Map<string, T>()

  for (const row of rows) {
    const remoteJid = normalizeWhatsAppJid(String(row.remote_jid || ''))
    const phone = normalizePhone(String(row.contact_phone || ''))
    if (!remoteJid && !phone)
      continue

    const instanceId = String(row.instance_id || '')
    const key = `${instanceId}:${remoteJid || phone}`
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, row)
      continue
    }

    const currentTime = new Date(current.last_message_at || current.created_at || 0).getTime()
    const rowTime = new Date(row.last_message_at || row.created_at || 0).getTime()
    if (rowTime >= currentTime)
      byKey.set(key, row)
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.created_at || 0).getTime()
    const bTime = new Date(b.last_message_at || b.created_at || 0).getTime()
    return bTime - aTime
  })
}
