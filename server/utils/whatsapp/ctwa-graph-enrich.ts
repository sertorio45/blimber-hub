import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptSecret } from '~/server/utils/marketing'

function graphVersion() {
  return process.env.META_GRAPH_VERSION || process.env.META_ADS_GRAPH_VERSION || 'v25.0'
}

async function resolveMetaToken(client: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .maybeSingle()

  const config = (data?.config || {}) as Record<string, unknown>
  return decryptSecret(config.capi_access_token_enc as string | undefined)
    || decryptSecret(config.access_token_enc as string | undefined)
    || null
}

/**
 * Best-effort Graph enrichment: source_id (ad) → campaign / adset names.
 * Never throws to callers — logs and returns false on failure.
 */
export async function enrichCtwaAttributionFromGraph(
  client: SupabaseClient,
  input: {
    tenantId: string
    attributionId: string
    leadId?: string | null
    sourceId?: string | null
  },
): Promise<boolean> {
  const adId = String(input.sourceId || '').trim()
  if (!adId)
    return false

  const accessToken = await resolveMetaToken(client, input.tenantId)
  if (!accessToken)
    return false

  try {
    const ad = await $fetch<{
      id?: string
      name?: string
      adset_id?: string
      campaign_id?: string
    }>(`https://graph.facebook.com/${graphVersion()}/${adId}`, {
      query: {
        fields: 'id,name,adset_id,campaign_id',
        access_token: accessToken,
      },
    })

    let adsetName: string | null = null
    let campaignName: string | null = null

    if (ad.adset_id) {
      try {
        const adset = await $fetch<{ name?: string }>(
          `https://graph.facebook.com/${graphVersion()}/${ad.adset_id}`,
          { query: { fields: 'name', access_token: accessToken } },
        )
        adsetName = adset.name || null
      }
      catch {
        // ignore
      }
    }

    if (ad.campaign_id) {
      try {
        const campaign = await $fetch<{ name?: string }>(
          `https://graph.facebook.com/${graphVersion()}/${ad.campaign_id}`,
          { query: { fields: 'name', access_token: accessToken } },
        )
        campaignName = campaign.name || null
      }
      catch {
        // ignore
      }
    }

    const patch = {
      meta_ad_id: ad.id || adId,
      meta_ad_name: ad.name || null,
      meta_adset_id: ad.adset_id || null,
      meta_adset_name: adsetName,
      meta_campaign_id: ad.campaign_id || null,
      meta_campaign_name: campaignName,
      updated_at: new Date().toISOString(),
    }

    await client
      .from('whatsapp_attribution')
      .update(patch)
      .eq('id', input.attributionId)
      .eq('tenant_id', input.tenantId)

    if (input.leadId) {
      await client
        .from('crm_lead')
        .update({
          meta_ad_id: patch.meta_ad_id,
          meta_ad_name: patch.meta_ad_name,
          meta_adset_id: patch.meta_adset_id,
          meta_adset_name: patch.meta_adset_name,
          meta_campaign_id: patch.meta_campaign_id,
          meta_campaign_name: patch.meta_campaign_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.leadId)
        .eq('tenant_id', input.tenantId)
    }

    return true
  }
  catch (err: any) {
    console.error('[CTWA] Graph enrich error:', err?.data?.error?.message || err?.message || err)
    return false
  }
}
