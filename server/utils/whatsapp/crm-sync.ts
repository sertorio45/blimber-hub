import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'

import { normalizePhone } from '~/server/utils/whatsapp/contact-utils'

interface SyncCrmOptions {
  createIfMissing?: boolean
  crmContactId?: string | null
}

export interface SyncCrmLeadOptions extends SyncCrmOptions {
  conversationId?: string | null
  existingLeadId?: string | null
  createLead?: boolean
  leadValue?: number
  serviceName?: string | null
  productId?: string | null
}

export interface CrmContactRecord {
  id: string
  name: string
  email: string
}

export interface CrmLeadRecord {
  id: string
  name: string
  funnelId: string | null
  salesStageId: string | null
  value: number
  serviceName: string | null
}

export interface SyncCrmWithLeadResult {
  crmContact: CrmContactRecord
  lead: CrmLeadRecord | null
  leadCreated: boolean
}

interface FunnelContext {
  funnelId: string
  funnelName: string
  salesStageId: string
  salesStageName: string
}

async function resolveDefaultFunnelContext(
  client: SupabaseClient,
  tenantId: string,
): Promise<FunnelContext> {
  const { data: funnels, error: pipelineError } = await client
    .from('crm_funnel')
    .select('id, name, is_active, is_default, priority, tenant_id')
    .or(`is_default.eq.true,tenant_id.eq.${tenantId}`)
    .order('priority', { ascending: true })

  if (pipelineError)
    throw createError({ statusCode: 400, statusMessage: pipelineError.message })

  const scopedFunnels = (funnels || []).filter(
    item => item.tenant_id === tenantId || item.is_default,
  )

  const activeFunnel = scopedFunnels.find(item => item.is_active)
    || scopedFunnels.find(item => item.is_default)
    || scopedFunnels[0]

  if (!activeFunnel?.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nenhum funil ativo encontrado. Configure um funil no CRM.',
    })
  }

  const { data: stages, error: stageError } = await client
    .from('crm_sales_stage')
    .select('id, name, order')
    .eq('funnel_id', activeFunnel.id)
    .order('order', { ascending: true })
    .limit(1)

  if (stageError)
    throw createError({ statusCode: 400, statusMessage: stageError.message })

  const firstStage = stages?.[0]
  if (!firstStage?.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O funil ativo não possui estágios configurados.',
    })
  }

  return {
    funnelId: activeFunnel.id as string,
    funnelName: String(activeFunnel.name || 'Funil'),
    salesStageId: firstStage.id as string,
    salesStageName: String(firstStage.name || 'Novo'),
  }
}

async function fetchLeadRecord(
  client: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<CrmLeadRecord | null> {
  const { data } = await client
    .from('crm_lead')
    .select('id, name, funnel_id, sales_stage_id, value, company')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data?.id)
    return null

  return {
    id: data.id as string,
    name: String(data.name || ''),
    funnelId: data.funnel_id as string | null,
    salesStageId: data.sales_stage_id as string | null,
    value: Number(data.value || 0),
    serviceName: data.company ? String(data.company) : null,
  }
}

async function linkLeadReferences(
  client: SupabaseClient,
  params: {
    tenantId: string
    leadId: string
    crmContactId: string
    whatsappContactId?: string | null
    conversationId?: string | null
  },
) {
  const now = new Date().toISOString()

  await client
    .from('crm_contact')
    .update({ lead_id: params.leadId, updated_at: now })
    .eq('id', params.crmContactId)
    .eq('tenant_id', params.tenantId)

  if (params.whatsappContactId) {
    await client
      .from('whatsapp_contact')
      .update({ updated_at: now })
      .eq('id', params.whatsappContactId)
      .eq('tenant_id', params.tenantId)
  }

  if (params.conversationId) {
    await client
      .from('whatsapp_conversation')
      .update({ lead_id: params.leadId, updated_at: now })
      .eq('id', params.conversationId)
      .eq('tenant_id', params.tenantId)
  }
}

export async function syncWhatsAppLeadToFunnel(
  client: SupabaseClient,
  tenantId: string,
  params: {
    crmContact: CrmContactRecord
    whatsappContact: Record<string, any>
    conversationId?: string | null
    existingLeadId?: string | null
    leadValue?: number
    serviceName?: string | null
    productId?: string | null
  },
): Promise<{ lead: CrmLeadRecord | null, leadCreated: boolean }> {
  let leadValue = params.leadValue
  let serviceName = params.serviceName ?? null

  if (params.productId) {
    const { data: product } = await client
      .from('crm_products')
      .select('name, price')
      .eq('id', params.productId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (product) {
      serviceName = String(product.name || serviceName || '')
      if (leadValue === undefined)
        leadValue = Number(product.price || 0)
    }
  }
  if (params.existingLeadId) {
    const existingLead = await fetchLeadRecord(client, tenantId, params.existingLeadId)
    if (existingLead) {
      await linkLeadReferences(client, {
        tenantId,
        leadId: existingLead.id,
        crmContactId: params.crmContact.id,
        whatsappContactId: params.whatsappContact.id,
        conversationId: params.conversationId,
      })
      return { lead: existingLead, leadCreated: false }
    }
  }

  const { data: crmContactRow } = await client
    .from('crm_contact')
    .select('lead_id')
    .eq('id', params.crmContact.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (crmContactRow?.lead_id) {
    const existingLead = await fetchLeadRecord(client, tenantId, crmContactRow.lead_id as string)
    if (existingLead) {
      await linkLeadReferences(client, {
        tenantId,
        leadId: existingLead.id,
        crmContactId: params.crmContact.id,
        whatsappContactId: params.whatsappContact.id,
        conversationId: params.conversationId,
      })
      return { lead: existingLead, leadCreated: false }
    }
  }

  const funnel = await resolveDefaultFunnelContext(client, tenantId)
  const leadName = params.whatsappContact.name || params.crmContact.name || params.whatsappContact.phone
  const now = new Date().toISOString()

  const { data: createdLead, error: leadError } = await client
    .from('crm_lead')
    .insert({
      tenant_id: tenantId,
      name: leadName,
      source: 'phone',
      status: 'new',
      priority: 'medium',
      value: leadValue ?? 0,
      company: serviceName,
      funnel_id: funnel.funnelId,
      sales_stage_id: funnel.salesStageId,
      notes: `Lead criado automaticamente via WhatsApp (${funnel.salesStageName}).`,
      tags: params.whatsappContact.tags || [],
      last_contact: now,
      created_at: now,
      updated_at: now,
    })
    .select('id, name, funnel_id, sales_stage_id, value, company')
    .single()

  if (leadError || !createdLead) {
    throw createError({
      statusCode: 400,
      statusMessage: leadError?.message || 'Failed to create CRM lead',
    })
  }

  const lead: CrmLeadRecord = {
    id: createdLead.id as string,
    name: String(createdLead.name || leadName),
    funnelId: createdLead.funnel_id as string | null,
    salesStageId: createdLead.sales_stage_id as string | null,
    value: Number(createdLead.value || 0),
    serviceName: createdLead.company ? String(createdLead.company) : null,
  }

  await linkLeadReferences(client, {
    tenantId,
    leadId: lead.id,
    crmContactId: params.crmContact.id,
    whatsappContactId: params.whatsappContact.id,
    conversationId: params.conversationId,
  })

  try {
    const { applyCtwaAttributionToLead } = await import('~/server/utils/crm/apply-ctwa-attribution')
    await applyCtwaAttributionToLead(client, {
      tenantId,
      leadId: lead.id,
      phone: params.whatsappContact.phone || params.crmContact.phone || null,
      enqueueLeadEvent: true,
      enrichGraph: true,
    })
  }
  catch (err: any) {
    console.error('[CTWA] Match on WhatsApp CRM sync failed:', err?.message || err)
  }

  return { lead, leadCreated: true }
}

export async function syncWhatsAppContactToCrm(
  client: SupabaseClient,
  tenantId: string,
  whatsappContact: Record<string, any>,
  options: SyncCrmOptions = {},
): Promise<CrmContactRecord> {
  const phone = normalizePhone(whatsappContact.phone || '')
  const name = whatsappContact.name || phone

  if (options.crmContactId) {
    const { data: crmContact, error } = await client
      .from('crm_contact')
      .update({
        name,
        phone: whatsappContact.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', options.crmContactId)
      .eq('tenant_id', tenantId)
      .select('id, name, email')
      .single()

    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })

    await client
      .from('whatsapp_contact')
      .update({ crm_contact_id: crmContact.id, updated_at: new Date().toISOString() })
      .eq('id', whatsappContact.id)

    return crmContact as CrmContactRecord
  }

  if (whatsappContact.crm_contact_id) {
    const { data: crmContact, error } = await client
      .from('crm_contact')
      .update({
        name,
        phone: whatsappContact.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', whatsappContact.crm_contact_id)
      .eq('tenant_id', tenantId)
      .select('id, name, email')
      .single()

    if (!error && crmContact)
      return crmContact as CrmContactRecord
  }

  const { data: byPhone } = await client
    .from('crm_contact')
    .select('id, name, email')
    .eq('tenant_id', tenantId)
    .or(`phone.ilike.%${phone.slice(-11)}%,phone.ilike.%${phone}%`)
    .limit(1)
    .maybeSingle()

  if (byPhone?.id) {
    await client
      .from('whatsapp_contact')
      .update({ crm_contact_id: byPhone.id, updated_at: new Date().toISOString() })
      .eq('id', whatsappContact.id)

    return byPhone as CrmContactRecord
  }

  if (!options.createIfMissing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Nenhum contato CRM encontrado para vincular',
    })
  }

  const placeholderEmail = `whatsapp+${phone || whatsappContact.id}@blimber.local`

  const { data: created, error: insertError } = await client
    .from('crm_contact')
    .insert({
      tenant_id: tenantId,
      name,
      email: placeholderEmail,
      phone: whatsappContact.phone,
    })
    .select('id, name, email')
    .single()

  if (insertError || !created) {
    throw createError({
      statusCode: 400,
      statusMessage: insertError?.message || 'Failed to create CRM contact',
    })
  }

  await client
    .from('whatsapp_contact')
    .update({ crm_contact_id: created.id, updated_at: new Date().toISOString() })
    .eq('id', whatsappContact.id)

  return created as CrmContactRecord
}

export async function syncWhatsAppContactToCrmWithLead(
  client: SupabaseClient,
  tenantId: string,
  whatsappContact: Record<string, any>,
  options: SyncCrmLeadOptions = {},
): Promise<SyncCrmWithLeadResult> {
  const crmContact = await syncWhatsAppContactToCrm(client, tenantId, whatsappContact, options)

  if (options.createLead === false) {
    return { crmContact, lead: null, leadCreated: false }
  }

  const { lead, leadCreated } = await syncWhatsAppLeadToFunnel(client, tenantId, {
    crmContact,
    whatsappContact,
    conversationId: options.conversationId,
    existingLeadId: options.existingLeadId,
    leadValue: options.leadValue,
    serviceName: options.serviceName,
    productId: options.productId,
  })

  return { crmContact, lead, leadCreated }
}
