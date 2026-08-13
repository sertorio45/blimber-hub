import process from 'node:process'

import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createError, defineEventHandler, getQuery } from 'h3'

import { decryptSecret } from '~/server/utils/marketing'
import {
  assertScopedTenantAccess,
  assertTenantModuleAccess,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'

function normalizeMetaAdAccountId(raw: string) {
  return String(raw || '').replace(/^act_/i, '')
}

/** CAPI uses META_GRAPH_VERSION (not META_ADS_GRAPH_VERSION). Default v25.0. */
function graphVersion() {
  return process.env.META_GRAPH_VERSION || 'v25.0'
}

function mapGraphError(error: any, fallback: string) {
  return createError({
    statusCode: error?.statusCode || 502,
    statusMessage: error?.data?.error?.message || error?.message || fallback,
  })
}

/**
 * List Meta businesses / ad accounts / datasets for CRM CAPI wizard.
 * Uses OAuth token from marketing_integrations (provider=meta).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })

  const client = await serverSupabaseServiceRole(event)
  const query = getQuery(event)
  const { role, tenantId: userTenantId } = resolveTenantApiAuth(user as any, event.context.auth?.tenantId)
  assertTenantModuleAccess(role)

  const tenantId = (query.tenant_id as string) || userTenantId
  if (!tenantId)
    throw createError({ statusCode: 400, statusMessage: 'Tenant ID é obrigatório' })
  assertScopedTenantAccess(role, userTenantId, tenantId)

  const resource = String(query.resource || 'businesses')
  if (!['businesses', 'ad_accounts', 'pixels', 'datasets'].includes(resource)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'resource inválido (businesses | ad_accounts | datasets)',
    })
  }

  const { data: integration } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta')
    .maybeSingle()

  const token = decryptSecret(integration?.config?.access_token_enc)
  if (!token)
    return { data: [] }

  const version = graphVersion()

  if (resource === 'businesses') {
    const res = await $fetch<{ data?: Array<{ id?: string, name?: string }> }>(
      `https://graph.facebook.com/${version}/me/businesses`,
      {
        query: {
          fields: 'id,name',
          access_token: token,
        },
      },
    ).catch((error: any) => {
      throw mapGraphError(error, 'Falha ao listar empresas Meta')
    })

    return {
      data: (res.data || []).map(row => ({
        id: String(row.id || ''),
        name: row.name || row.id,
      })).filter(row => row.id),
    }
  }

  if (resource === 'ad_accounts') {
    const businessId = String(query.business_id || '').trim()
    if (businessId) {
      const owned = await $fetch<{ data?: Array<{ id?: string, name?: string, account_status?: number | string }> }>(
        `https://graph.facebook.com/${version}/${businessId}/owned_ad_accounts`,
        {
          query: {
            fields: 'id,name,account_status',
            access_token: token,
            limit: 200,
          },
        },
      ).catch(() => ({ data: [] as any[] }))

      const clientAccounts = await $fetch<{ data?: Array<{ id?: string, name?: string, account_status?: number | string }> }>(
        `https://graph.facebook.com/${version}/${businessId}/client_ad_accounts`,
        {
          query: {
            fields: 'id,name,account_status',
            access_token: token,
            limit: 200,
          },
        },
      ).catch(() => ({ data: [] as any[] }))

      const byId = new Map<string, { id: string, name: string }>()
      for (const row of [...(owned.data || []), ...(clientAccounts.data || [])]) {
        const id = normalizeMetaAdAccountId(String(row.id || ''))
        if (!id)
          continue
        byId.set(id, {
          id,
          name: `${row.name || id} (${row.account_status ?? 'status desconhecido'})`,
        })
      }

      if (byId.size)
        return { data: [...byId.values()] }
    }

    const metaResponse = await $fetch<{ data?: Array<{ id?: string, name?: string, account_status?: string }> }>(
      `https://graph.facebook.com/${version}/me/adaccounts`,
      {
        query: {
          fields: 'id,name,account_status',
          access_token: token,
          limit: 200,
        },
      },
    ).catch((error: any) => {
      throw mapGraphError(error, 'Falha ao listar contas Meta')
    })

    return {
      data: (metaResponse.data || []).map(row => ({
        id: normalizeMetaAdAccountId(String(row.id || '')),
        name: `${row.name || row.id} (${row.account_status || 'status desconhecido'})`,
      })).filter(row => row.id),
    }
  }

  // datasets / pixels
  const adAccountId = normalizeMetaAdAccountId(String(query.ad_account_id || ''))
  const businessId = String(query.business_id || '').trim()
  const byId = new Map<string, { id: string, name: string }>()

  if (adAccountId) {
    const act = `act_${adAccountId}`
    const res = await $fetch<{ data?: Array<{ id?: string, name?: string }> }>(
      `https://graph.facebook.com/${version}/${act}/adspixels`,
      {
        query: {
          fields: 'id,name',
          access_token: token,
        },
      },
    ).catch((error: any) => {
      throw mapGraphError(error, 'Falha ao listar datasets/pixels da conta')
    })
    for (const row of res.data || []) {
      const id = String(row.id || '')
      if (id)
        byId.set(id, { id, name: row.name || id })
    }
  }

  if (businessId && !byId.size) {
    const ownedPixels = await $fetch<{ data?: Array<{ id?: string, name?: string }> }>(
      `https://graph.facebook.com/${version}/${businessId}/owned_pixels`,
      {
        query: {
          fields: 'id,name',
          access_token: token,
        },
      },
    ).catch(() => ({ data: [] as any[] }))
    for (const row of ownedPixels.data || []) {
      const id = String(row.id || '')
      if (id)
        byId.set(id, { id, name: row.name || id })
    }
  }

  if (!adAccountId && !businessId && !byId.size) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe ad_account_id ou business_id para listar datasets',
    })
  }

  return { data: [...byId.values()] }
})
