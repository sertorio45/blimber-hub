import type { SupabaseClient } from '@supabase/supabase-js'

import {
  findOrUpsertWhatsAppConversation,
  normalizeWhatsAppJid,
  upsertGroupParticipant,
} from '~/server/utils/whatsapp/conversation-utils'
import { normalizePhone } from '~/server/utils/whatsapp/contact-utils'
import {
  evolutionFetchAllGroups,
  type EvolutionClientConfig,
} from '~/server/utils/whatsapp/evolution-client'

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

  const { data: created } = await client
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

  return created?.id as string | null
}

export async function syncEvolutionGroups(
  client: SupabaseClient,
  params: {
    tenantId: string
    instanceId: string
    evoConfig: EvolutionClientConfig
  },
) {
  const groups = await evolutionFetchAllGroups(params.evoConfig, true)
  const list = Array.isArray(groups) ? groups : []
  let synced = 0

  for (const group of list) {
    const groupJid = normalizeWhatsAppJid(String(group.id || group.jid || ''))
    if (!groupJid.endsWith('@g.us'))
      continue

    const subject = String(group.subject || group.name || groupJid)
    const picture = (group.pictureUrl || group.profilePictureUrl || null) as string | null
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
        group_subject: subject,
        profile_picture: picture,
        group_metadata: {
          size: group.size ?? null,
          owner: group.owner ?? null,
          desc: group.desc ?? null,
          restrict: group.restrict ?? null,
          announce: group.announce ?? null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    const participants = Array.isArray(group.participants) ? group.participants : []
    for (const participant of participants) {
      const participantJid = normalizeWhatsAppJid(String(participant.id || participant.jid || ''))
      if (!participantJid)
        continue
      const phone = normalizePhone(participantJid.replace(/@.*/, ''))
      const contactId = phone
        ? await upsertContact(client, params.tenantId, phone, participant.name)
        : null

      await upsertGroupParticipant(client, {
        tenantId: params.tenantId,
        conversationId,
        participantJid,
        phone,
        name: participant.name || phone || participantJid,
        adminRole: participant.admin || null,
        contactId,
      })
    }

    synced += 1
  }

  return { synced, total: list.length }
}
