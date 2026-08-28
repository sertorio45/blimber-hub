import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureAdLeadSource } from '~/server/utils/crm/lead-source-ads'
import { enqueueMetaConversion, processMetaConversionQueue } from '~/server/utils/crm/meta-capi'
import {
  buildLeadCtwaFields,
  findRecentWhatsappAttribution,
  normalizePhoneE164,
} from '~/server/utils/whatsapp/ctwa-attribution'
import { enrichCtwaAttributionFromGraph } from '~/server/utils/whatsapp/ctwa-graph-enrich'

export interface ApplyCtwaAttributionResult {
  matched: boolean
  attributionId?: string
  leadEnqueued?: boolean
  reason?: string
}

/**
 * Match recent WhatsApp CTWA attribution by phone and apply fields on the CRM lead.
 * Optionally enqueues Meta CAPI Lead (business_messaging when ctwa_clid present).
 */
export async function applyCtwaAttributionToLead(
  client: SupabaseClient,
  input: {
    tenantId: string
    leadId: string
    phone?: string | null
    enqueueLeadEvent?: boolean
    enrichGraph?: boolean
  },
): Promise<ApplyCtwaAttributionResult> {
  let phone = input.phone || null
  if (!phone) {
    const { data: contact } = await client
      .from('crm_contact')
      .select('phone')
      .eq('tenant_id', input.tenantId)
      .eq('lead_id', input.leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    phone = contact?.phone || null
  }

  if (!phone || !normalizePhoneE164(phone))
    return { matched: false, reason: 'missing_phone' }

  const attribution = await findRecentWhatsappAttribution(client, input.tenantId, phone)
  if (!attribution)
    return { matched: false, reason: 'no_attribution' }

  const adSourceId = await ensureAdLeadSource(client, input.tenantId)
  const fields = buildLeadCtwaFields(attribution)

  const { data: existingLead } = await client
    .from('crm_lead')
    .select('id, source, source_id, meta_ctwa_clid')
    .eq('id', input.leadId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()

  if (!existingLead)
    return { matched: false, reason: 'lead_not_found' }

  // Skip if already attributed with same click id.
  if (existingLead.meta_ctwa_clid && existingLead.meta_ctwa_clid === attribution.ctwa_clid) {
    await client
      .from('whatsapp_attribution')
      .update({ matched_lead_id: input.leadId, updated_at: new Date().toISOString() })
      .eq('id', attribution.id)
    return { matched: true, attributionId: attribution.id, reason: 'already_attributed' }
  }

  const { error: leadError } = await client
    .from('crm_lead')
    .update({
      ...fields,
      source: existingLead.source || 'social',
      source_id: existingLead.source_id || adSourceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.leadId)
    .eq('tenant_id', input.tenantId)

  if (leadError)
    throw leadError

  await client
    .from('whatsapp_attribution')
    .update({ matched_lead_id: input.leadId, updated_at: new Date().toISOString() })
    .eq('id', attribution.id)

  if (input.enrichGraph !== false) {
    try {
      await enrichCtwaAttributionFromGraph(client, {
        tenantId: input.tenantId,
        attributionId: attribution.id,
        leadId: input.leadId,
        sourceId: attribution.source_id || attribution.meta_ad_id,
      })
    }
    catch (err: any) {
      console.error('[CTWA] Graph enrich failed:', err?.message || err)
    }
  }

  let leadEnqueued = false
  if (input.enqueueLeadEvent !== false) {
    const result = await enqueueMetaConversion(client, {
      tenantId: input.tenantId,
      leadId: input.leadId,
      eventName: 'Lead',
    })
    leadEnqueued = Boolean(result.enqueued)
    if (result.enqueued)
      await processMetaConversionQueue(client, { tenantId: input.tenantId, limit: 5 })
  }

  return {
    matched: true,
    attributionId: attribution.id,
    leadEnqueued,
  }
}
