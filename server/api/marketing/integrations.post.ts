import process from 'node:process'

import { createError, defineEventHandler, readBody } from 'h3'

import { normalizeGoogleCustomerId } from '~/server/utils/google-ads'
import { normalizeGa4PropertyId } from '~/server/utils/marketing-reports'
import { clearMarketingCampaignCacheForTenant, decryptSecret, encryptSecret } from '~/server/utils/marketing'
import { recordSocialAudit } from '~/server/utils/social-audit'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.provider || !body?.config) {
    throw createError({ statusCode: 400, statusMessage: 'provider and config are required' })
  }

  const { tenantId, client, user } = await requireSocialContext(
    event,
    'marketing.social.integrations',
    body.tenant_id,
  )

  const provider = body.provider as 'google_ads' | 'google_analytics' | 'meta' | 'linkedin'
  if (!['google_ads', 'google_analytics', 'meta', 'linkedin'].includes(provider))
    throw createError({ statusCode: 400, statusMessage: 'Provider inválido' })
  const incomingConfig = { ...(body.config || {}) }
  if ('page_access_token' in incomingConfig)
    delete (incomingConfig as any).page_access_token

  const { data: existingIntegration } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .maybeSingle()

  const config: Record<string, any> = { ...(existingIntegration?.config || {}), ...incomingConfig }

  if (provider === 'meta') {
    const optionalMetaKeys = ['ad_account_id', 'page_id', 'pixel_id', 'instagram_business_account_id'] as const
    for (const k of optionalMetaKeys) {
      if (k in incomingConfig && (incomingConfig[k] === '' || incomingConfig[k] == null))
        delete config[k]
    }
  }
  if (provider === 'linkedin') {
    const optionalKeys = ['organization_id', 'organization_name'] as const
    for (const key of optionalKeys) {
      if (key in incomingConfig && (incomingConfig[key] === '' || incomingConfig[key] == null))
        delete config[key]
    }
  }

  if (incomingConfig.access_token) {
    config.access_token_enc = encryptSecret(incomingConfig.access_token)
    delete config.access_token
  }
  if (incomingConfig.refresh_token) {
    config.refresh_token_enc = encryptSecret(incomingConfig.refresh_token)
    delete config.refresh_token
  }
  // Platform owns Google Ads developer token (GOOGLE_ADS_DEVELOPER_TOKEN).
  // Ignore any client-supplied developer token / OAuth client secrets.
  delete config.developer_token
  delete config.developer_token_enc
  delete config.client_id
  delete config.client_secret
  delete config.client_id_enc
  delete config.client_secret_enc
  // Keep legacy encrypted developer token only if still present on existing row
  // and no env token is configured — resolution happens server-side via utils.
  if (existingIntegration?.config?.developer_token_enc && !process.env.GOOGLE_ADS_DEVELOPER_TOKEN)
    config.developer_token_enc = existingIntegration.config.developer_token_enc

  if (provider === 'google_ads') {
    if (incomingConfig.customer_id != null) {
      const customerId = normalizeGoogleCustomerId(incomingConfig.customer_id)
      if (customerId)
        config.customer_id = customerId
      else
        delete config.customer_id
    }
    // Platform / tenant MCC (login-customer-id) is not used — strip legacy field.
    delete config.login_customer_id
    delete incomingConfig.login_customer_id
  }

  if (provider === 'google_analytics') {
    const rawProperty = incomingConfig.property_id ?? incomingConfig.analytics_account_id
    if (rawProperty != null) {
      const propertyId = normalizeGa4PropertyId(rawProperty)
      if (propertyId) {
        config.property_id = propertyId
        config.analytics_account_id = propertyId
      }
      else if (String(rawProperty || '').trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: 'ID de propriedade GA4 inválido. Selecione uma propriedade numérica da lista (não use Measurement ID G-XXXX).',
        })
      }
      else {
        delete config.property_id
        delete config.analytics_account_id
      }
    }
  }

  if (provider === 'meta' && incomingConfig.page_id !== undefined) {
    const pageId = String(incomingConfig.page_id || '').trim()
    const userToken = decryptSecret(config.access_token_enc)
    if (pageId && userToken) {
      const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0'
      const res = await $fetch<{ data?: Array<{ id?: string, access_token?: string, tasks?: string[] }> }>(
        `https://graph.facebook.com/${graphVersion}/me/accounts`,
        {
          query: {
            fields: 'id,access_token,tasks',
            access_token: userToken,
          },
        },
      ).catch(() => ({ data: [] }))
      const row = (res.data || []).find(p => String(p.id) === pageId)
      if (row?.access_token) {
        config.page_access_token_enc = encryptSecret(row.access_token)
        config.page_tasks = row.tasks || []
      }
      else {
        delete config.page_access_token_enc
        throw createError({
          statusCode: 400,
          statusMessage: 'Não foi possível obter o token da Página. Reconecte a Meta com as permissões pages_manage_posts e pages_show_list, e confirme que seu usuário tem função na Página.',
        })
      }
    }
    else {
      delete config.page_access_token_enc
    }
  }

  const payload = {
    tenant_id: tenantId,
    provider,
    is_active: body.is_active ?? true,
    config,
  }

  const { data, error } = await client
    .from('marketing_integrations')
    .upsert(payload, { onConflict: 'tenant_id,provider' })
    .select('id, provider, is_active, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  await clearMarketingCampaignCacheForTenant(client, tenantId)

  if (provider === 'meta') {
    const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0'
    const userToken = decryptSecret(config.access_token_enc)
    const pageId = String(config.page_id || '')
    const instagramId = String(config.instagram_business_account_id || '')
    const rows: Array<Record<string, unknown>> = []

    if (pageId && userToken) {
      const page = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/${pageId}`, {
        query: { fields: 'id,name,picture', access_token: userToken },
      }).catch(() => null)
      if (page?.name)
        config.page_name = page.name
      rows.push({
        tenant_id: tenantId,
        platform: 'facebook',
        provider: 'meta',
        integration_id: data.id,
        external_account_id: pageId,
        name: page?.name || `Página ${pageId}`,
        avatar_url: page?.picture?.data?.url || null,
        capabilities: ['publish_post'],
        is_active: true,
      })
    }

    if (instagramId && userToken) {
      const account = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/${instagramId}`, {
        query: { fields: 'id,name,username,profile_picture_url', access_token: userToken },
      }).catch(() => null)
      if (account?.name || account?.username)
        config.instagram_name = account.name || account.username
      if (account?.username)
        config.instagram_username = account.username
      rows.push({
        tenant_id: tenantId,
        platform: 'instagram',
        provider: 'meta',
        integration_id: data.id,
        external_account_id: instagramId,
        name: account?.name || account?.username || `Instagram ${instagramId}`,
        username: account?.username || null,
        avatar_url: account?.profile_picture_url || null,
        capabilities: ['publish_image', 'publish_video', 'publish_carousel'],
        is_active: true,
      })
    }

    const { error: deactivateError } = await client
      .from('social_accounts')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('provider', 'meta')
    if (deactivateError)
      throw createError({ statusCode: 500, statusMessage: deactivateError.message })

    if (rows.length) {
      const { error: accountsError } = await client
        .from('social_accounts')
        .upsert(rows, { onConflict: 'tenant_id,platform,external_account_id' })
      if (accountsError)
        throw createError({ statusCode: 500, statusMessage: accountsError.message })
    }

    await client
      .from('marketing_integrations')
      .update({ config })
      .eq('id', data.id)
  }

  if (provider === 'linkedin' && config.organization_id) {
    const { error: deactivateError } = await client
      .from('social_accounts')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('provider', 'linkedin')
    if (deactivateError)
      throw createError({ statusCode: 500, statusMessage: deactivateError.message })

    const { error: accountError } = await client.from('social_accounts').upsert({
      tenant_id: tenantId,
      platform: 'linkedin',
      provider: 'linkedin',
      integration_id: data.id,
      external_account_id: String(config.organization_id),
      name: String(config.organization_name || `Organização ${config.organization_id}`),
      capabilities: ['publish_post', 'publish_image', 'publish_video'],
      is_active: true,
      token_expires_at: config.token_expires_at || null,
    }, { onConflict: 'tenant_id,platform,external_account_id' })
    if (accountError)
      throw createError({ statusCode: 500, statusMessage: accountError.message })
  }

  if (provider === 'linkedin' && !config.organization_id) {
    const { error: deactivateError } = await client
      .from('social_accounts')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('provider', 'linkedin')
    if (deactivateError)
      throw createError({ statusCode: 500, statusMessage: deactivateError.message })
  }

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: user.id,
    action: 'integration.updated',
    entityType: 'marketing_integration',
    entityId: data.id,
    after: { provider, isActive: true },
  })

  return { data }
})
