import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'

import { decryptSecret } from '~/server/utils/marketing'
import { formatBrazilianMobilePhone, normalizePhone } from '~/server/utils/whatsapp/contact-utils'

export type MetaCapiEventName = 'Lead' | 'Purchase'
export type MetaCapiEventStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
export type MetaCapiActionSource =
  | 'website'
  | 'chat'
  | 'business_messaging'
  | 'phone_call'
  | 'email'
  | 'other'
  | 'system_generated'

const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000] as const

interface MetaIntegrationConfig {
  pixel_id?: string
  dataset_id?: string
  ad_account_id?: string
  business_id?: string
  business_name?: string
  capi_enabled?: boolean
  capi_setup_mode?: 'manual' | 'oauth'
  capi_access_token_enc?: string
  capi_test_event_code?: string
  access_token_enc?: string
}

interface LeadRow {
  id: string
  tenant_id: string
  name: string | null
  source: string | null
  value: number | null
  status: string | null
  closed_at: string | null
  created_at: string | null
  meta_lead_id: string | null
  fbc: string | null
  fbp: string | null
  fbclid: string | null
  meta_ctwa_clid: string | null
  meta_waba_id: string | null
  attribution_channel: string | null
}

interface ContactPii {
  email: string | null
  phone: string | null
}

export interface MetaCapiSettings {
  enabled: boolean
  pixel_id: string | null
  dataset_id: string | null
  ad_account_id: string | null
  business_id: string | null
  business_name: string | null
  has_token: boolean
  has_oauth: boolean
  setup_mode: 'manual' | 'oauth'
  test_event_code: string | null
  meta_connected: boolean
}

/** CRM Conversions API — Meta Conversion Leads payload identity. */
export const META_CRM_LEAD_EVENT_SOURCE = 'Blimber'
/** Official Meta value — must be the literal string `crm` (not the CRM product name). */
export const META_CRM_EVENT_SOURCE = 'crm'
export const META_CRM_ACTION_SOURCE: MetaCapiActionSource = 'system_generated'

/** Prefer Events Manager token; fall back to Meta OAuth user token (ads_management). */
function resolveCapiAccessToken(config: MetaIntegrationConfig): string | null {
  return decryptSecret(config.capi_access_token_enc)
    || decryptSecret(config.access_token_enc)
    || null
}

/** CAPI uses META_GRAPH_VERSION (not META_ADS_GRAPH_VERSION). Default v25.0. */
function graphVersion() {
  return process.env.META_GRAPH_VERSION || 'v25.0'
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(email?: string | null) {
  const value = String(email || '').trim().toLowerCase()
  if (!value || value.includes('@blimber.local'))
    return null
  return value
}

function normalizePhoneForMeta(phone?: string | null) {
  const e164 = formatBrazilianMobilePhone(phone)
  if (e164)
    return e164
  const digits = normalizePhone(String(phone || ''))
  if (digits.length < 10)
    return null
  return digits.startsWith('55') ? digits : `55${digits}`
}

function buildFbc(fbclid?: string | null, existingFbc?: string | null) {
  if (existingFbc)
    return existingFbc
  const clickId = String(fbclid || '').trim()
  if (!clickId)
    return null
  return `fb.1.${Math.floor(Date.now() / 1000)}.${clickId}`
}

export function resolveMetaActionSource(input?: {
  source?: string | null
  metaLeadId?: string | null
  metaCtwaClid?: string | null
  hasWhatsapp?: boolean
}): MetaCapiActionSource {
  // CTWA / Business Messaging matching requires business_messaging + messaging_channel.
  if (String(input?.metaCtwaClid || '').trim())
    return 'business_messaging'
  // Meta CRM Conversion Leads guide: system_generated for classic CRM events.
  return META_CRM_ACTION_SOURCE
}

function nextAttemptAt(attempts: number) {
  const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)]
  return new Date(Date.now() + delay).toISOString()
}

async function loadMetaIntegration(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ id: string, config: MetaIntegrationConfig, isActive: boolean } | null> {
  const { data } = await client
    .from('marketing_integrations')
    .select('id, config, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .maybeSingle()

  if (!data?.id)
    return null

  return {
    id: data.id as string,
    config: (data.config || {}) as MetaIntegrationConfig,
    isActive: Boolean(data.is_active),
  }
}

export async function getMetaCapiSettings(
  client: SupabaseClient,
  tenantId: string,
): Promise<MetaCapiSettings> {
  const integration = await loadMetaIntegration(client, tenantId)
  const config = integration?.config || {}
  const datasetId = (config.dataset_id || config.pixel_id)
    ? String(config.dataset_id || config.pixel_id)
    : null
  const pixelId = datasetId
  const adAccountId = config.ad_account_id ? String(config.ad_account_id).replace(/^act_/i, '') : null
  const businessId = config.business_id ? String(config.business_id) : null
  const hasOauth = Boolean(decryptSecret(config.access_token_enc))
  const hasToken = Boolean(resolveCapiAccessToken(config))
  const setupMode: 'manual' | 'oauth' = config.capi_setup_mode === 'manual'
    ? 'manual'
    : config.capi_setup_mode === 'oauth'
      ? 'oauth'
      : (hasOauth ? 'oauth' : 'manual')

  return {
    enabled: Boolean(config.capi_enabled),
    pixel_id: pixelId,
    dataset_id: datasetId,
    ad_account_id: adAccountId,
    business_id: businessId,
    business_name: config.business_name ? String(config.business_name) : null,
    has_token: hasToken,
    has_oauth: hasOauth,
    setup_mode: setupMode,
    test_event_code: config.capi_test_event_code ? String(config.capi_test_event_code) : null,
    meta_connected: Boolean(pixelId && hasToken),
  }
}

async function resolveLeadPii(
  client: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<ContactPii & { hasWhatsapp: boolean }> {
  const [{ data: contacts }, { data: conversation }] = await Promise.all([
    client
      .from('crm_contact')
      .select('email, phone')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .limit(5),
    client
      .from('whatsapp_conversation')
      .select('contact_phone')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])

  const contactEmail = (contacts || []).map(c => normalizeEmail(c.email)).find(Boolean) || null
  const contactPhone = (contacts || []).map(c => c.phone).find(p => normalizePhoneForMeta(p)) || null
  const waPhone = conversation?.contact_phone || null

  return {
    email: contactEmail,
    phone: contactPhone || waPhone,
    hasWhatsapp: Boolean(waPhone),
  }
}

export function buildUserData(input: {
  email?: string | null
  phone?: string | null
  name?: string | null
  fbc?: string | null
  fbp?: string | null
  metaLeadId?: string | null
  metaCtwaClid?: string | null
  wabaId?: string | null
}) {
  const userData: Record<string, unknown> = {}
  const email = normalizeEmail(input.email)
  const phone = normalizePhoneForMeta(input.phone)

  if (email)
    userData.em = [sha256(email)]
  if (phone)
    userData.ph = [sha256(phone)]

  const firstName = String(input.name || '').trim().split(/\s+/)[0]
  if (firstName)
    userData.fn = [sha256(firstName.toLowerCase())]

  const fbc = buildFbc(null, input.fbc)
  if (fbc)
    userData.fbc = fbc
  if (input.fbp)
    userData.fbp = input.fbp
  if (input.metaLeadId)
    userData.lead_id = input.metaLeadId
  // Meta requires whatsapp_business_account_id together with ctwa_clid on business_messaging events.
  if (String(input.metaCtwaClid || '').trim()) {
    userData.ctwa_clid = String(input.metaCtwaClid).trim()
    if (String(input.wabaId || '').trim())
      userData.whatsapp_business_account_id = String(input.wabaId).trim()
  }

  return userData
}

/**
 * Meta answers rejected events with a generic "Invalid parameter"; the actionable
 * reason lives in error_user_title/error_user_msg, so surface all of it.
 */
export function describeMetaError(error: any): string {
  const metaError = error?.data?.error
  const parts = [
    metaError?.error_user_title,
    metaError?.error_user_msg,
    metaError?.message,
    error?.statusMessage,
    error?.message,
  ]
    .map(part => String(part || '').trim())
    .filter(Boolean)

  const unique = [...new Set(parts)]
  return unique.length ? unique.join(' — ') : 'Falha ao enviar evento para a Meta'
}

export function hasMinimumMatchData(userData: Record<string, unknown>) {
  return Boolean(userData.em || userData.ph || userData.lead_id || userData.fbc || userData.ctwa_clid)
}

async function fetchLeadRow(
  client: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<LeadRow | null> {
  const { data } = await client
    .from('crm_lead')
    .select('id, tenant_id, name, source, value, status, closed_at, created_at, meta_lead_id, fbc, fbp, fbclid, meta_ctwa_clid, meta_waba_id, attribution_channel')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return (data as LeadRow | null) || null
}

/**
 * WABA id for business_messaging events. Prefers the value captured with the click,
 * falling back to the tenant's Cloud API instance when the lead predates that capture.
 */
async function resolveWabaId(
  client: SupabaseClient,
  tenantId: string,
  lead: LeadRow,
): Promise<string | null> {
  if (lead.meta_waba_id)
    return lead.meta_waba_id

  const { data } = await client
    .from('whatsapp_integration')
    .select('cloud_business_id')
    .eq('tenant_id', tenantId)
    .eq('provider', 'cloud_api')
    .not('cloud_business_id', 'is', null)
    .limit(1)
    .maybeSingle()

  return (data?.cloud_business_id as string | null) || null
}

export async function enqueueMetaConversion(
  client: SupabaseClient,
  input: {
    tenantId: string
    leadId: string
    eventName: MetaCapiEventName
    eventTime?: string | null
    force?: boolean
  },
): Promise<{ enqueued: boolean, reason?: string, eventRowId?: string }> {
  const settings = await getMetaCapiSettings(client, input.tenantId)
  if (!settings.enabled)
    return { enqueued: false, reason: 'capi_disabled' }
  if (!settings.pixel_id || !settings.has_token)
    return { enqueued: false, reason: 'capi_not_configured' }

  const { data: existing } = await client
    .from('crm_meta_conversion_events')
    .select('id, status, event_id')
    .eq('tenant_id', input.tenantId)
    .eq('lead_id', input.leadId)
    .eq('event_name', input.eventName)
    .maybeSingle()

  if (existing?.status === 'sent' && !input.force)
    return { enqueued: false, reason: 'already_sent', eventRowId: existing.id as string }

  const lead = await fetchLeadRow(client, input.tenantId, input.leadId)
  if (!lead)
    return { enqueued: false, reason: 'lead_not_found' }

  const pii = await resolveLeadPii(client, input.tenantId, input.leadId)
  const actionSource = resolveMetaActionSource({
    source: lead.source,
    metaLeadId: lead.meta_lead_id,
    metaCtwaClid: lead.meta_ctwa_clid,
    hasWhatsapp: pii.hasWhatsapp,
  })
  const eventTime = input.eventTime
    || (input.eventName === 'Purchase' ? lead.closed_at : lead.created_at)
    || new Date().toISOString()

  if (input.eventName === 'Purchase' && !normalizePhoneForMeta(pii.phone)) {
    return { enqueued: false, reason: 'missing_phone' }
  }

  const fbc = buildFbc(lead.fbclid, lead.fbc)
  const userData = buildUserData({
    email: pii.email,
    phone: pii.phone,
    name: lead.name,
    fbc,
    fbp: lead.fbp,
    metaLeadId: lead.meta_lead_id,
    metaCtwaClid: lead.meta_ctwa_clid,
    wabaId: lead.meta_ctwa_clid ? await resolveWabaId(client, input.tenantId, lead) : null,
  })

  if (!hasMinimumMatchData(userData)) {
    return { enqueued: false, reason: 'missing_pii' }
  }

  const eventId = input.force ? randomUUID() : (existing?.event_id as string || randomUUID())
  const { data: row, error } = await client
    .from('crm_meta_conversion_events')
    .upsert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      event_name: input.eventName,
      event_id: eventId,
      event_time: eventTime,
      action_source: actionSource,
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      payload_snapshot: null,
      meta_response: null,
      sent_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,lead_id,event_name' })
    .select('id')
    .single()

  if (error)
    throw error

  return { enqueued: true, eventRowId: row.id as string }
}

async function sendEventToMeta(input: {
  pixelId: string
  accessToken: string
  testEventCode?: string | null
  event: {
    event_name: string
    event_time: number
    event_id: string
    action_source: string
    user_data: Record<string, unknown>
    custom_data?: Record<string, unknown>
    messaging_channel?: string
  }
}) {
  const body: Record<string, unknown> = {
    data: [input.event],
    access_token: input.accessToken,
  }
  if (input.testEventCode)
    body.test_event_code = input.testEventCode

  return await $fetch<Record<string, unknown>>(
    `https://graph.facebook.com/${graphVersion()}/${input.pixelId}/events`,
    {
      method: 'POST',
      body,
    },
  )
}

async function processSingleEvent(
  client: SupabaseClient,
  row: {
    id: string
    tenant_id: string
    lead_id: string
    event_name: MetaCapiEventName
    event_id: string
    event_time: string
    action_source: string
    attempts: number
  },
  integration: { config: MetaIntegrationConfig },
) {
  const pixelId = String(integration.config.dataset_id || integration.config.pixel_id || '')
  const accessToken = resolveCapiAccessToken(integration.config)
  if (!pixelId || !accessToken) {
    await client.from('crm_meta_conversion_events').update({
      status: 'failed',
      last_error: 'Dataset/Pixel ou token Meta não configurados',
      next_attempt_at: nextAttemptAt(row.attempts),
      attempts: row.attempts + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return { ok: false }
  }

  const lead = await fetchLeadRow(client, row.tenant_id, row.lead_id)
  if (!lead) {
    await client.from('crm_meta_conversion_events').update({
      status: 'skipped',
      last_error: 'Lead removido',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return { ok: false }
  }

  const pii = await resolveLeadPii(client, row.tenant_id, row.lead_id)
  const fbc = buildFbc(lead.fbclid, lead.fbc)
  const userData = buildUserData({
    email: pii.email,
    phone: pii.phone,
    name: lead.name,
    fbc,
    fbp: lead.fbp,
    metaLeadId: lead.meta_lead_id,
    metaCtwaClid: lead.meta_ctwa_clid,
    wabaId: lead.meta_ctwa_clid ? await resolveWabaId(client, row.tenant_id, lead) : null,
  })

  if (!hasMinimumMatchData(userData)) {
    await client.from('crm_meta_conversion_events').update({
      status: 'skipped',
      last_error: 'Lead sem telefone (obrigatório) ou dados de matching insuficientes',
      payload_snapshot: { skip_reason: 'missing_pii' },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return { ok: false }
  }

  if (row.event_name === 'Purchase' && !normalizePhoneForMeta(pii.phone)) {
    await client.from('crm_meta_conversion_events').update({
      status: 'skipped',
      last_error: 'Telefone do contato obrigatório para Purchase',
      payload_snapshot: { skip_reason: 'missing_phone' },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return { ok: false }
  }

  const actionSource = resolveMetaActionSource({
    source: lead.source,
    metaLeadId: lead.meta_lead_id,
    metaCtwaClid: lead.meta_ctwa_clid,
    hasWhatsapp: pii.hasWhatsapp,
  })

  const eventTimeUnix = Math.floor(new Date(row.event_time).getTime() / 1000)
  const customData: Record<string, unknown> = {
    lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
    event_source: META_CRM_EVENT_SOURCE,
  }
  if (row.event_name === 'Purchase') {
    customData.currency = 'BRL'
    customData.value = Number(lead.value || 0)
    if (lead.name)
      customData.content_name = lead.name
  }

  const payloadEvent: Record<string, unknown> = {
    event_name: row.event_name,
    event_time: eventTimeUnix,
    event_id: row.event_id,
    action_source: actionSource,
    user_data: userData,
    custom_data: customData,
  }
  if (actionSource === 'business_messaging')
    payloadEvent.messaging_channel = 'whatsapp'

  try {
    const response = await sendEventToMeta({
      pixelId,
      accessToken,
      // Never attach test_event_code on real CRM sends — that forces Test Events (often labeled Web).
      event: payloadEvent as {
        event_name: string
        event_time: number
        event_id: string
        action_source: string
        user_data: Record<string, unknown>
        custom_data?: Record<string, unknown>
        messaging_channel?: string
      },
    })

    await client.from('crm_meta_conversion_events').update({
      status: 'sent',
      attempts: row.attempts + 1,
      last_error: null,
      payload_snapshot: payloadEvent,
      meta_response: response,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    return { ok: true }
  }
  catch (error: any) {
    const attempts = row.attempts + 1
    const failedPermanently = attempts >= MAX_ATTEMPTS

    await client.from('crm_meta_conversion_events').update({
      status: failedPermanently ? 'failed' : 'pending',
      attempts,
      last_error: describeMetaError(error).slice(0, 500),
      payload_snapshot: payloadEvent,
      meta_response: error?.data || null,
      next_attempt_at: failedPermanently
        ? new Date().toISOString()
        : nextAttemptAt(attempts),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    return { ok: false }
  }
}

export async function processMetaConversionQueue(
  client: SupabaseClient,
  input: { tenantId?: string, limit?: number } = {},
) {
  const limit = Math.min(Math.max(input.limit || 20, 1), 100)
  const nowIso = new Date().toISOString()

  let query = client
    .from('crm_meta_conversion_events')
    .select('id, tenant_id, lead_id, event_name, event_id, event_time, action_source, attempts, status')
    .eq('status', 'pending')
    .lte('next_attempt_at', nowIso)
    .lt('attempts', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(limit)

  if (input.tenantId)
    query = query.eq('tenant_id', input.tenantId)

  const { data: rows, error } = await query
  if (error)
    throw error

  let processed = 0
  let sent = 0
  const integrationCache = new Map<string, { config: MetaIntegrationConfig } | null>()

  for (const row of rows || []) {
    let integration = integrationCache.get(row.tenant_id)
    if (integration === undefined) {
      const loaded = await loadMetaIntegration(client, row.tenant_id)
      integration = loaded
        ? { config: loaded.config }
        : null
      integrationCache.set(row.tenant_id, integration)
    }

    if (!integration || !integration.config.capi_enabled) {
      await client.from('crm_meta_conversion_events').update({
        status: 'skipped',
        last_error: 'CAPI desativado para o tenant',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      continue
    }

    await client.from('crm_meta_conversion_events').update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    const result = await processSingleEvent(client, {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      lead_id: row.lead_id as string,
      event_name: row.event_name as MetaCapiEventName,
      event_id: row.event_id as string,
      event_time: row.event_time as string,
      action_source: row.action_source as string,
      attempts: Number(row.attempts || 0),
    }, integration)

    processed += 1
    if (result.ok)
      sent += 1
  }

  return { processed, sent }
}

export function scheduleMetaCapiProcessing(
  event: H3Event | null,
  client: SupabaseClient,
  tenantId: string,
) {
  const run = () => processMetaConversionQueue(client, { tenantId, limit: 10 }).catch(() => {})

  const waitUntil = (event as any)?.waitUntil as ((p: Promise<unknown>) => void) | undefined
  if (typeof waitUntil === 'function') {
    waitUntil(Promise.resolve().then(run))
    return
  }

  void run()
}

export interface MetaCapiWonCandidate {
  id: string
  name: string | null
  value: number
  currency: 'BRL'
  closed_at: string | null
  event_time: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  already_sent: boolean
  eligible: boolean
  blocking_reasons: string[]
}

async function getWonStageIds(client: SupabaseClient, tenantId?: string) {
  let query = client.from('crm_sales_stage').select('id, name, tenant_id')
  if (tenantId)
    query = query.eq('tenant_id', tenantId)
  const { data: stages } = await query
  return new Set(
    (stages || [])
      .filter((stage) => {
        const name = String(stage.name || '').toLowerCase()
        return name.includes('ganh') || name.includes('won')
      })
      .map(stage => stage.id as string),
  )
}

function assessSyncEligibility(input: {
  phone: string | null
  name: string | null
  closedAt: string | null
}): { eligible: boolean, blocking_reasons: string[], event_time: string } {
  const blocking: string[] = []
  if (!normalizePhoneForMeta(input.phone))
    blocking.push('Telefone do contato obrigatório')
  // Name is preferred when available — warn but do not block alone
  const eventTime = input.closedAt || new Date().toISOString()
  return {
    eligible: blocking.length === 0,
    blocking_reasons: blocking,
    event_time: eventTime,
  }
}

export async function listWonLeadsForMetaSync(
  client: SupabaseClient,
  input: { tenantId: string, includeSent?: boolean },
): Promise<MetaCapiWonCandidate[]> {
  const wonStageIds = await getWonStageIds(client, input.tenantId)

  const { data: sent } = await client
    .from('crm_meta_conversion_events')
    .select('lead_id')
    .eq('tenant_id', input.tenantId)
    .eq('event_name', 'Purchase')
    .eq('status', 'sent')

  const sentIds = new Set((sent || []).map(r => r.lead_id as string))

  const { data: leads } = await client
    .from('crm_lead')
    .select('id, name, value, status, sales_stage_id, closed_at')
    .eq('tenant_id', input.tenantId)
    .order('closed_at', { ascending: false, nullsFirst: false })
    .limit(300)

  const wonLeads = (leads || []).filter((lead) => {
    const isWon = lead.status === 'won'
      || (lead.sales_stage_id && wonStageIds.has(lead.sales_stage_id as string))
    if (!isWon)
      return false
    if (lead.status === 'lost')
      return false
    if (!input.includeSent && sentIds.has(lead.id as string))
      return false
    return true
  })

  const leadIds = wonLeads.map(l => l.id as string)
  const contactsByLead = new Map<string, { name: string | null, email: string | null, phone: string | null }>()

  if (leadIds.length) {
    const { data: contacts } = await client
      .from('crm_contact')
      .select('lead_id, name, email, phone')
      .eq('tenant_id', input.tenantId)
      .in('lead_id', leadIds)

    for (const c of contacts || []) {
      const leadId = c.lead_id as string
      if (!leadId)
        continue
      const existing = contactsByLead.get(leadId)
      const phone = normalizePhoneForMeta(c.phone) || c.phone
      const email = normalizeEmail(c.email)
      if (!existing) {
        contactsByLead.set(leadId, {
          name: c.name || null,
          email,
          phone: phone || null,
        })
        continue
      }
      // Prefer the most complete contact
      if (!existing.phone && phone)
        existing.phone = phone
      if (!existing.email && email)
        existing.email = email
      if (!existing.name && c.name)
        existing.name = c.name
    }

    // WhatsApp fallback for phone
    const { data: conversations } = await client
      .from('whatsapp_conversation')
      .select('lead_id, contact_phone')
      .eq('tenant_id', input.tenantId)
      .in('lead_id', leadIds)

    for (const conv of conversations || []) {
      const leadId = conv.lead_id as string
      if (!leadId || !conv.contact_phone)
        continue
      const current = contactsByLead.get(leadId) || { name: null, email: null, phone: null }
      if (!normalizePhoneForMeta(current.phone)) {
        current.phone = conv.contact_phone
        contactsByLead.set(leadId, current)
      }
    }
  }

  return wonLeads.map((lead) => {
    const contact = contactsByLead.get(lead.id as string) || { name: null, email: null, phone: null }
    const displayName = lead.name || contact.name
    const assessment = assessSyncEligibility({
      phone: contact.phone,
      name: displayName,
      closedAt: lead.closed_at as string | null,
    })
    const alreadySent = sentIds.has(lead.id as string)

    return {
      id: lead.id as string,
      name: displayName,
      value: Number(lead.value || 0),
      currency: 'BRL' as const,
      closed_at: lead.closed_at as string | null,
      event_time: assessment.event_time,
      contact_name: contact.name,
      contact_email: contact.email,
      contact_phone: contact.phone,
      already_sent: alreadySent,
      eligible: assessment.eligible && !alreadySent,
      blocking_reasons: alreadySent
        ? ['Já enviado à Meta']
        : assessment.blocking_reasons,
    }
  })
}

export async function syncSelectedWonPurchases(
  client: SupabaseClient,
  input: {
    tenantId: string
    leadIds: string[]
    force?: boolean
  },
) {
  const uniqueIds = [...new Set(input.leadIds.filter(Boolean))]
  if (!uniqueIds.length) {
    return {
      candidates: 0,
      enqueued: 0,
      skipped: 0,
      skipped_reasons: [] as Array<{ lead_id: string, reason: string }>,
    }
  }

  const candidates = await listWonLeadsForMetaSync(client, {
    tenantId: input.tenantId,
    includeSent: true,
  })
  const byId = new Map(candidates.map(c => [c.id, c]))

  let enqueued = 0
  let skipped = 0
  const skipped_reasons: Array<{ lead_id: string, reason: string }> = []

  for (const leadId of uniqueIds) {
    const row = byId.get(leadId)
    if (!row) {
      skipped += 1
      skipped_reasons.push({ lead_id: leadId, reason: 'Lead não está em Ganho ou não encontrado' })
      continue
    }
    if (row.already_sent && !input.force) {
      skipped += 1
      skipped_reasons.push({ lead_id: leadId, reason: 'Já enviado' })
      continue
    }
    if (!normalizePhoneForMeta(row.contact_phone)) {
      skipped += 1
      skipped_reasons.push({ lead_id: leadId, reason: 'Telefone do contato obrigatório' })
      continue
    }

    const result = await enqueueMetaConversion(client, {
      tenantId: input.tenantId,
      leadId,
      eventName: 'Purchase',
      eventTime: row.event_time,
      force: input.force,
    })
    if (result.enqueued) {
      enqueued += 1
    }
    else {
      skipped += 1
      skipped_reasons.push({ lead_id: leadId, reason: result.reason || 'não enfileirado' })
    }
  }

  return {
    candidates: uniqueIds.length,
    enqueued,
    skipped,
    skipped_reasons,
  }
}

export async function syncPendingWonPurchases(
  client: SupabaseClient,
  input: { tenantId: string, limit?: number, force?: boolean, leadIds?: string[] },
) {
  if (input.leadIds?.length) {
    return syncSelectedWonPurchases(client, {
      tenantId: input.tenantId,
      leadIds: input.leadIds,
      force: input.force,
    })
  }

  // Without explicit IDs, do not mass-sync — selection UI is required.
  return { candidates: 0, enqueued: 0, skipped: 0, skipped_reasons: [] as Array<{ lead_id: string, reason: string }> }
}

export interface MetaCapiTestEventOptions {
  /** `ctwa` reproduces a Click-to-WhatsApp conversion (business_messaging + ctwa_clid + WABA id). */
  mode?: 'default' | 'ctwa'
  eventName?: MetaCapiEventName
}

export async function sendMetaCapiTestEvent(
  client: SupabaseClient,
  tenantId: string,
  options: MetaCapiTestEventOptions = {},
) {
  const integration = await loadMetaIntegration(client, tenantId)
  if (!integration)
    throw createErrorLike(400, 'Salve o Pixel e o token da API de Conversões antes de testar')

  const pixelId = String(integration.config.dataset_id || integration.config.pixel_id || '')
  const accessToken = resolveCapiAccessToken(integration.config)
  const testCode = integration.config.capi_test_event_code

  if (!pixelId)
    throw createErrorLike(400, 'Selecione o Dataset (Pixel) Meta')
  if (!accessToken)
    throw createErrorLike(400, 'Conecte a conta Meta ou informe o token da API de Conversões')
  if (!testCode)
    throw createErrorLike(400, 'Informe o código de teste do Gerenciador de Eventos (TEST...)')

  const isCtwa = options.mode === 'ctwa'
  const eventName: MetaCapiEventName = options.eventName || 'Lead'

  let wabaId: string | null = null
  if (isCtwa) {
    const { data } = await client
      .from('whatsapp_integration')
      .select('cloud_business_id')
      .eq('tenant_id', tenantId)
      .eq('provider', 'cloud_api')
      .not('cloud_business_id', 'is', null)
      .limit(1)
      .maybeSingle()
    wabaId = (data?.cloud_business_id as string | null) || null

    if (!wabaId)
      throw createErrorLike(400, 'Conecte uma instância WhatsApp Cloud API (com WABA ID) antes de testar CTWA')
  }

  const eventId = randomUUID()
  const eventTime = new Date().toISOString()
  const actionSource = isCtwa ? 'business_messaging' : META_CRM_ACTION_SOURCE
  const payloadEvent: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: actionSource,
    user_data: isCtwa
      ? {
          ctwa_clid: `test_ctwa_clid_${eventId.slice(0, 8)}`,
          whatsapp_business_account_id: wabaId,
        }
      : {
          em: [sha256('test@example.com')],
          ph: [sha256('5511999999999')],
        },
    custom_data: isCtwa
      ? { currency: 'BRL', value: 1, test: true }
      : {
          lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
          event_source: META_CRM_EVENT_SOURCE,
          test: true,
        },
  }
  if (isCtwa)
    payloadEvent.messaging_channel = 'whatsapp'

  try {
    const response = await sendEventToMeta({
      pixelId,
      accessToken,
      testEventCode: testCode,
      event: payloadEvent as Parameters<typeof sendEventToMeta>[0]['event'],
    })

    await client.from('crm_meta_conversion_events').insert({
      tenant_id: tenantId,
      lead_id: null,
      event_name: eventName,
      event_id: eventId,
      event_time: eventTime,
      action_source: actionSource,
      status: 'sent',
      attempts: 1,
      is_test: true,
      last_error: null,
      payload_snapshot: payloadEvent,
      meta_response: response,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    return { eventId, response }
  }
  catch (error: any) {
    const message = describeMetaError(error)

    await client.from('crm_meta_conversion_events').insert({
      tenant_id: tenantId,
      lead_id: null,
      event_name: eventName,
      event_id: eventId,
      event_time: eventTime,
      action_source: actionSource,
      status: 'failed',
      attempts: 1,
      is_test: true,
      last_error: String(message).slice(0, 500),
      payload_snapshot: payloadEvent,
      meta_response: error?.data || null,
      updated_at: new Date().toISOString(),
    }).catch(() => {})

    throw createErrorLike(error?.statusCode || 502, String(message))
  }
}

export async function countPendingWonPurchases(
  client: SupabaseClient,
  tenantId: string,
) {
  const candidates = await listWonLeadsForMetaSync(client, { tenantId, includeSent: false })
  return candidates.filter(c => c.eligible).length
}

export async function attachMetaCapiStatusToLeads(
  client: SupabaseClient,
  tenantId: string,
  leadIds: string[],
) {
  const map = new Map<string, { status: MetaCapiEventStatus, event_name: string, last_error: string | null }>()
  if (!leadIds.length)
    return map

  const { data } = await client
    .from('crm_meta_conversion_events')
    .select('lead_id, status, event_name, last_error, updated_at')
    .eq('tenant_id', tenantId)
    .in('lead_id', leadIds)
    .order('updated_at', { ascending: false })

  for (const row of data || []) {
    const leadId = row.lead_id as string
    // Prefer Purchase status when both exist
    const current = map.get(leadId)
    if (!current || row.event_name === 'Purchase') {
      map.set(leadId, {
        status: row.status as MetaCapiEventStatus,
        event_name: row.event_name as string,
        last_error: row.last_error as string | null,
      })
    }
  }

  return map
}

function createErrorLike(statusCode: number, statusMessage: string) {
  const error = new Error(statusMessage) as Error & { statusCode: number, statusMessage: string }
  error.statusCode = statusCode
  error.statusMessage = statusMessage
  return error
}
