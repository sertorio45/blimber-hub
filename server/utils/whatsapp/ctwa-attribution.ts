import type { SupabaseClient } from '@supabase/supabase-js'

import { formatBrazilianMobilePhone, normalizePhone } from '~/server/utils/whatsapp/contact-utils'

/** Match window for CTWA click → CRM lead create (days). */
export const CTWA_ATTRIBUTION_MATCH_DAYS = 7

export interface CtwaReferral {
  ctwaClid: string
  sourceId: string | null
  sourceType: string | null
  headline: string | null
  body: string | null
}

export interface WhatsappAttributionRow {
  id: string
  tenant_id: string
  instance_id: string | null
  phone_e164: string
  ctwa_clid: string
  source_id: string | null
  source_type: string | null
  headline: string | null
  body: string | null
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_ad_id: string | null
  meta_campaign_name: string | null
  meta_adset_name: string | null
  meta_ad_name: string | null
  waba_id: string | null
  received_at: string
  matched_lead_id: string | null
}

/**
 * Normalize phone to digits with BR country code when possible (55…).
 * Used for attribution storage and match.
 */
export function normalizePhoneE164(phone?: string | null): string | null {
  const formatted = formatBrazilianMobilePhone(phone)
  if (formatted)
    return formatted

  const digits = normalizePhone(String(phone || ''))
  if (digits.length < 10)
    return null
  if (digits.startsWith('55') && digits.length >= 12)
    return digits
  if (digits.length === 10 || digits.length === 11)
    return `55${digits}`
  return digits.length >= 10 ? digits : null
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text)
      return text
  }
  return null
}

/**
 * Extract CTWA referral from Cloud API message or Evolution-shaped payloads.
 */
export function extractCtwaReferral(payload: Record<string, unknown> | null | undefined): CtwaReferral | null {
  if (!payload || typeof payload !== 'object')
    return null

  const referral
    = (payload.referral as Record<string, unknown> | undefined)
      || ((payload.message as Record<string, unknown> | undefined)?.referral as Record<string, unknown> | undefined)
      || ((payload.contextInfo as Record<string, unknown> | undefined)?.externalAdReply as Record<string, unknown> | undefined)
      || ((payload.message as Record<string, unknown> | undefined)?.contextInfo as Record<string, unknown> | undefined)?.externalAdReply as Record<string, unknown> | undefined
      || (payload.contextInfo as Record<string, unknown> | undefined)
      || null

  if (!referral || typeof referral !== 'object')
    return null

  const ctwaClid = pickString(
    referral.ctwa_clid,
    referral.ctwaClid,
    referral.ctwa_click_id,
    referral.click_id,
  )
  if (!ctwaClid)
    return null

  return {
    ctwaClid,
    sourceId: pickString(referral.source_id, referral.sourceId, referral.ad_id, referral.adId),
    sourceType: pickString(referral.source_type, referral.sourceType),
    headline: pickString(referral.headline, referral.title),
    body: pickString(referral.body, referral.description),
  }
}

export function buildCtwaMessageMetadata(referral: CtwaReferral): Record<string, unknown> {
  return {
    ctwa: {
      ctwa_clid: referral.ctwaClid,
      source_id: referral.sourceId,
      source_type: referral.sourceType,
      headline: referral.headline,
      body: referral.body,
    },
  }
}

export async function upsertWhatsappAttribution(
  client: SupabaseClient,
  input: {
    tenantId: string
    instanceId?: string | null
    wabaId?: string | null
    phone: string
    referral: CtwaReferral
    receivedAt?: string | null
  },
): Promise<WhatsappAttributionRow | null> {
  const phoneE164 = normalizePhoneE164(input.phone)
  if (!phoneE164)
    return null

  const receivedAt = input.receivedAt || new Date().toISOString()
  const row = {
    tenant_id: input.tenantId,
    instance_id: input.instanceId || null,
    waba_id: input.wabaId || null,
    phone_e164: phoneE164,
    ctwa_clid: input.referral.ctwaClid,
    source_id: input.referral.sourceId,
    source_type: input.referral.sourceType,
    headline: input.referral.headline,
    body: input.referral.body,
    meta_ad_id: input.referral.sourceId,
    received_at: receivedAt,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('whatsapp_attribution')
    .upsert(row, { onConflict: 'tenant_id,phone_e164,ctwa_clid' })
    .select('*')
    .single()

  if (error) {
    console.error('[CTWA] Failed to upsert attribution:', error.message)
    return null
  }

  return data as WhatsappAttributionRow
}

export async function findRecentWhatsappAttribution(
  client: SupabaseClient,
  tenantId: string,
  phone: string,
  options: { withinDays?: number, unmatchedOnly?: boolean } = {},
): Promise<WhatsappAttributionRow | null> {
  const phoneE164 = normalizePhoneE164(phone)
  if (!phoneE164)
    return null

  const withinDays = options.withinDays ?? CTWA_ATTRIBUTION_MATCH_DAYS
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString()

  let query = client
    .from('whatsapp_attribution')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', phoneE164)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(1)

  if (options.unmatchedOnly !== false)
    query = query.is('matched_lead_id', null)

  const { data } = await query.maybeSingle()
  if (data)
    return data as WhatsappAttributionRow

  // Fallback: allow rematch of the latest attribution in window (same phone, already matched).
  if (options.unmatchedOnly !== false) {
    const { data: latest } = await client
      .from('whatsapp_attribution')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone_e164', phoneE164)
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (latest as WhatsappAttributionRow | null) || null
  }

  return null
}

export function buildLeadCtwaFields(attribution: WhatsappAttributionRow) {
  return {
    meta_ctwa_clid: attribution.ctwa_clid,
    meta_source_id: attribution.source_id,
    meta_campaign_id: attribution.meta_campaign_id,
    meta_adset_id: attribution.meta_adset_id,
    meta_ad_id: attribution.meta_ad_id || attribution.source_id,
    meta_campaign_name: attribution.meta_campaign_name,
    meta_adset_name: attribution.meta_adset_name,
    meta_ad_name: attribution.meta_ad_name || attribution.headline,
    meta_waba_id: attribution.waba_id,
    attribution_method: 'ctwa_clid' as const,
    attribution_date: attribution.received_at,
    attribution_channel: 'whatsapp' as const,
  }
}
