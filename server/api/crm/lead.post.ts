import { serverSupabaseServiceRole } from '#supabase/server'

import { createError, defineEventHandler, readBody } from 'h3'

import { applyCtwaAttributionToLead } from '~/server/utils/crm/apply-ctwa-attribution'
import {
  ensureAdLeadSource,
  hasMetaCampaignAttribution,
} from '~/server/utils/crm/lead-source-ads'

export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseServiceRole(event)
    const body = await readBody(event)
    let tenantId = body.tenant_id || event.context.auth?.tenantId
    if (!tenantId) {
      const {
        data: { user },
      } = await client.auth.getUser()
      if (user && user.user_metadata?.tenant_id) {
        tenantId = user.user_metadata.tenant_id
      }
    }
    if (!tenantId) {
      throw createError({ statusCode: 400, message: 'Não foi possível identificar o tenant_id' })
    }

    const attribution = {
      meta_lead_id: body.meta_lead_id ?? null,
      fbc: body.fbc ?? null,
      fbp: body.fbp ?? null,
      fbclid: body.fbclid ?? null,
      meta_ctwa_clid: body.meta_ctwa_clid ?? null,
    }

    let sourceId = body.source_id ?? null
    let source = body.source
    if (hasMetaCampaignAttribution(attribution)) {
      const adSourceId = await ensureAdLeadSource(client, tenantId)
      if (!sourceId)
        sourceId = adSourceId
      if (!source)
        source = 'social'
    }

    const leadToInsert = {
      name: body.name,
      company: body.company,
      status: body.status,
      source,
      source_id: sourceId,
      value: body.value,
      values: Array.isArray(body.values) ? body.values : [],
      priority: body.priority,
      assigned_to: body.assigned_to,
      notes: body.notes,
      created_at: body.created_at,
      updated_at: body.updated_at,
      last_contact: body.last_contact,
      next_follow_up: body.next_follow_up,
      tags: body.tags,
      tenant_id: tenantId,
      funnel_id: body.funnel_id ?? null,
      sales_stage_id: body.sales_stage_id ?? null,
      meta_lead_id: attribution.meta_lead_id,
      fbc: attribution.fbc,
      fbp: attribution.fbp,
      fbclid: attribution.fbclid,
      meta_ctwa_clid: attribution.meta_ctwa_clid,
    }
    if (!leadToInsert.name) {
      throw createError({ statusCode: 400, message: 'Nome é obrigatório' })
    }
    const { data, error } = await client.from('crm_lead').insert([leadToInsert]).select().single()
    if (error) {
      throw createError({ statusCode: 500, message: error.message || 'Falha ao criar lead' })
    }

    // Silent CTWA match by phone (body.phone or contact created separately).
    const phone = typeof body.phone === 'string' ? body.phone : null
    let ctwa: Awaited<ReturnType<typeof applyCtwaAttributionToLead>> | null = null
    try {
      ctwa = await applyCtwaAttributionToLead(client, {
        tenantId,
        leadId: data.id as string,
        phone,
        enqueueLeadEvent: true,
        enrichGraph: true,
      })
    }
    catch (err: any) {
      console.error('[CTWA] Match on lead.create failed:', err?.message || err)
    }

    return { statusCode: 201, body: data, ctwa }
  }
  catch (error: any) {
    throw createError({ statusCode: error.statusCode || 500, message: error.message || 'Erro interno do servidor' })
  }
})
