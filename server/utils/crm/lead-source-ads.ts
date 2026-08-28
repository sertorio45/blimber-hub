import type { SupabaseClient } from '@supabase/supabase-js'

export const AD_LEAD_SOURCE_NAME = 'Lead de anúncio'

/**
 * Ensures tenant has origin "Lead de anúncio" for Meta/campaign inbound leads.
 */
export async function ensureAdLeadSource(
  client: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data: existing } = await client
    .from('crm_lead_source_table')
    .select('id, name')
    .eq('tenant_id', tenantId)

  const match = (existing || []).find(
    row => String(row.name || '').trim().toLowerCase() === AD_LEAD_SOURCE_NAME.toLowerCase(),
  )
  if (match?.id)
    return match.id as string

  const { data: created, error } = await client
    .from('crm_lead_source_table')
    .insert({
      name: AD_LEAD_SOURCE_NAME,
      description: 'Leads provenientes de campanhas / anúncios Meta',
      is_default: false,
      tenant_id: tenantId,
    })
    .select('id')
    .single()

  if (error || !created?.id) {
    // Race: another request may have created it
    const { data: again } = await client
      .from('crm_lead_source_table')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', AD_LEAD_SOURCE_NAME)
      .maybeSingle()
    if (again?.id)
      return again.id as string
    throw error || new Error('Falha ao criar origem Lead de anúncio')
  }

  return created.id as string
}

export function hasMetaCampaignAttribution(input: {
  meta_lead_id?: string | null
  fbclid?: string | null
  fbc?: string | null
  fbp?: string | null
  meta_ctwa_clid?: string | null
}): boolean {
  return Boolean(
    String(input.meta_lead_id || '').trim()
    || String(input.fbclid || '').trim()
    || String(input.fbc || '').trim()
    || String(input.fbp || '').trim()
    || String(input.meta_ctwa_clid || '').trim(),
  )
}
