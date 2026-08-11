import process from 'node:process'

import { createError, defineEventHandler, getQuery } from 'h3'

import {
  getGoogleAccessToken,
  listGoogleAdsAccounts,
  resolveGoogleAdsDeveloperToken,
  throwGoogleAdsConfigError,
} from '~/server/utils/google-ads'
import { decryptSecret } from '~/server/utils/marketing'
import { requireSocialContext } from '~/server/utils/social-context'

function normalizeMetaAdAccountId(raw: string) {
  return String(raw || '').replace(/^act_/i, '')
}

export default defineEventHandler(async (event): Promise<any> => {
  const query = getQuery(event)
  const provider = String(query.provider || '')
  if (!['google_ads', 'google_analytics', 'meta', 'linkedin'].includes(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider inválido' })
  }

  const resource = String(query.resource || (provider === 'meta' ? 'ad_accounts' : ''))

  const { tenantId, client } = await requireSocialContext(event, 'marketing.social.integrations')

  const { data: integration } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .maybeSingle()

  const token = decryptSecret(integration?.config?.access_token_enc)
  // Google providers refresh via getGoogleAccessToken; Meta/LinkedIn need a stored access token.
  if (!token && provider !== 'google_ads' && provider !== 'google_analytics') {
    return { data: [] }
  }
  const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0'

  if (provider === 'meta' && resource === 'pages') {
    const res = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/me/accounts`, {
      query: {
        fields: 'id,name',
        access_token: token,
      },
    }).catch((error: any) => {
      throw createError({
        statusCode: error?.statusCode || 502,
        statusMessage: error?.data?.error?.message || error?.message || 'Falha ao listar páginas Meta',
      })
    })
    return {
      data: (res.data || []).map((row: any) => ({
        id: String(row.id || ''),
        name: row.name || row.id,
      })),
    }
  }

  if (provider === 'meta' && resource === 'pixels') {
    const adAccountId = normalizeMetaAdAccountId(String(query.ad_account_id || ''))
    if (!adAccountId) {
      throw createError({ statusCode: 400, statusMessage: 'ad_account_id é obrigatório para listar pixels' })
    }
    const act = `act_${adAccountId}`
    const res = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/${act}/adspixels`, {
      query: {
        fields: 'id,name',
        access_token: token,
      },
    }).catch((error: any) => {
      throw createError({
        statusCode: error?.statusCode || 502,
        statusMessage: error?.data?.error?.message || error?.message || 'Falha ao listar pixels Meta',
      })
    })
    return {
      data: (res.data || []).map((row: any) => ({
        id: String(row.id || ''),
        name: row.name || row.id,
      })),
    }
  }

  if (provider === 'meta' && resource === 'instagram') {
    const pageId = String(query.page_id || '').trim()
    const adAccountId = normalizeMetaAdAccountId(String(query.ad_account_id || ''))
    if (!pageId && !adAccountId) {
      throw createError({ statusCode: 400, statusMessage: 'Informe ad_account_id e/ou page_id para listar Instagram' })
    }

    const byId = new Map<string, { id: string, name: string, username: string | null, source?: string }>()

    if (adAccountId) {
      const act = `act_${adAccountId}`
      const igRes = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/${act}/instagram_accounts`, {
        query: {
          fields: 'id,username,name',
          access_token: token,
        },
      }).catch(() => ({ data: [] }))
      for (const row of igRes.data || []) {
        if (!row?.id)
          continue
        const id = String(row.id)
        byId.set(id, {
          id,
          name: row.username ? `@${row.username}` : (row.name || id),
          username: row.username || null,
          source: 'ad_account',
        })
      }
    }

    if (pageId) {
      const res = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/${pageId}`, {
        query: {
          fields: 'instagram_business_account{id,username,name}',
          access_token: token,
        },
      }).catch(() => ({}))
      const ig = res.instagram_business_account
      if (ig?.id) {
        const id = String(ig.id)
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name: ig.username ? `@${ig.username}` : (ig.name || id),
            username: ig.username || null,
            source: 'page',
          })
        }
      }
    }

    return {
      data: [...byId.values()].map(({ source: _s, ...rest }) => rest),
    }
  }

  if (provider === 'google_ads') {
    const googleConfig = integration?.config || {}
    const accessToken = await getGoogleAccessToken(googleConfig)
    if (!accessToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Google Ads não autenticado. Conecte a conta novamente.',
      })
    }

    const developerToken = resolveGoogleAdsDeveloperToken(googleConfig)
    if (!developerToken)
      throwGoogleAdsConfigError(null)

    const { accounts, warning } = await listGoogleAdsAccounts(
      accessToken,
      developerToken,
    )
    return {
      data: accounts,
      warning: warning || undefined,
    }
  }

  if (provider === 'google_analytics') {
    const accessToken = await getGoogleAccessToken(integration?.config || {})
    if (!accessToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Google Analytics não autenticado. Conecte a conta novamente.',
      })
    }

    const response = await $fetch<any>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch((error: any) => {
      const status = error?.statusCode || error?.status || 502
      const payload = error?.data?.error || error?.data || {}
      const rawMessage = String(payload?.message || error?.message || '')
      const reason = Array.isArray(payload?.details)
        ? String(payload.details.find((d: any) => d?.reason)?.reason || '')
        : ''
      let message = rawMessage || 'Falha ao listar propriedades GA4'
      if (/SERVICE_DISABLED|has not been used in project|it is disabled/i.test(`${reason} ${rawMessage}`)) {
        message = 'API Google Analytics Admin desativada no projeto Google Cloud do OAuth. Ative "Google Analytics Admin API" no Console.'
      }
      else if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(`${reason} ${rawMessage}`)) {
        message = 'Token Google sem escopo analytics.readonly. Reconecte o Google Analytics (não o Ads) em Integrações.'
      }
      throw createError({
        statusCode: status >= 400 && status < 600 ? status : 502,
        statusMessage: message,
      })
    })

    // Only real GA4 properties — never fall back to account IDs (Data API needs property_id).
    const data = (response.accountSummaries || []).flatMap((summary: any) => {
      const accountId = String(summary.account || '').split('/').pop() || ''
      const accountName = summary.displayName || `Conta ${accountId}`
      return (summary.propertySummaries || [])
        .map((property: any) => {
          // Admin returns `properties/{numericId}` — keep digits only.
          const id = String(property.property || '')
            .replace(/^(properties\/)+/i, '')
            .split('/')
            .pop() || ''
          if (!id || !/^\d+$/.test(id))
            return null
          return {
            id,
            name: `${accountName} — ${property.displayName || id}`,
            account_id: accountId,
          }
        })
        .filter(Boolean)
    })
    return { data }
  }

  if (provider === 'linkedin') {
    const linkedinVersion = process.env.LINKEDIN_VERSION || '202605'
    const headers = {
      'Authorization': `Bearer ${token}`,
      'LinkedIn-Version': linkedinVersion,
      'X-Restli-Protocol-Version': '2.0.0',
    }
    const response = await $fetch<any>('https://api.linkedin.com/rest/organizationAcls', {
      headers,
      query: {
        q: 'roleAssignee',
        state: 'APPROVED',
      },
    }).catch((error: any) => {
      throw createError({
        statusCode: error?.statusCode || 502,
        statusMessage: error?.data?.message || 'Falha ao listar organizações LinkedIn',
      })
    })
    const organizationIds = (response.elements || [])
      .map((row: any) => String(row.organization || '').split(':').pop())
      .filter(Boolean)
    const organizations = await Promise.all(organizationIds.map(async (id: string) => {
      const organization = await $fetch<any>(`https://api.linkedin.com/rest/organizations/${id}`, {
        headers,
      }).catch(() => null)
      const localizedName = organization?.localizedName || organization?.vanityName
      return { id, name: localizedName || `Organização ${id}` }
    }))
    return { data: organizations }
  }

  if (provider !== 'meta' || resource !== 'ad_accounts') {
    throw createError({ statusCode: 400, statusMessage: 'Combinação provider/resource inválida' })
  }

  const metaResponse = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/me/adaccounts`, {
    query: {
      fields: 'id,name,account_status',
      access_token: token,
    },
  }).catch((error: any) => {
    throw createError({
      statusCode: error?.statusCode || 502,
      statusMessage: error?.data?.error?.message || error?.message || 'Falha ao listar contas Meta',
    })
  })

  return {
    data: (metaResponse.data || []).map((row: any) => ({
      id: normalizeMetaAdAccountId(String(row.id || '')),
      name: `${row.name || row.id} (${row.account_status || 'status desconhecido'})`,
    })),
  }
})
