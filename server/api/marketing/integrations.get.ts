import { defineEventHandler, getQuery } from 'h3'

import { resolveGoogleAdsDeveloperToken } from '~/server/utils/google-ads'
import { decryptSecret, maskSensitiveValue } from '~/server/utils/marketing'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { tenantId, client } = await requireSocialContext(
    event,
    'marketing.social.integrations',
    query.tenant_id as string | undefined,
  )

  const { data, error } = await client
    .from('marketing_integrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('provider')

  if (error) {
    return { status: 400, message: error.message }
  }

  const sanitized = (data || []).map((row: any) => {
    const config = row.config || {}
    const token
      = decryptSecret(config.access_token_enc)
        || decryptSecret(config.refresh_token_enc)
    const pageToken = decryptSecret(config.page_access_token_enc)
    const missingPublishScopes = Array.isArray(config.missing_publish_scopes)
      ? config.missing_publish_scopes
      : []

    // Never expose encrypted secrets or developer credentials to the client.
    const publicConfig: Record<string, any> = {
      customer_id: config.customer_id,
      analytics_account_id: config.analytics_account_id,
      property_id: config.property_id,
      ad_account_id: config.ad_account_id,
      page_id: config.page_id,
      page_name: config.page_name,
      pixel_id: config.pixel_id,
      instagram_business_account_id: config.instagram_business_account_id,
      instagram_name: config.instagram_name,
      instagram_username: config.instagram_username,
      organization_id: config.organization_id,
      organization_name: config.organization_name,
      granted_scopes: config.granted_scopes,
      missing_publish_scopes: config.missing_publish_scopes,
      token_expires_at: config.token_expires_at,
      capi_enabled: config.capi_enabled,
    }

    return {
      id: row.id,
      provider: row.provider,
      is_active: row.is_active,
      updated_at: row.updated_at,
      config: publicConfig,
      has_key: Boolean(token),
      has_page_token: Boolean(pageToken),
      has_capi_token: Boolean(decryptSecret(config.capi_access_token_enc)),
      google_ads_ready: row.provider === 'google_ads'
        ? Boolean(token && resolveGoogleAdsDeveloperToken(config) && config.customer_id)
        : undefined,
      google_ads_needs_account: row.provider === 'google_ads'
        ? Boolean(token && !config.customer_id)
        : undefined,
      capi_enabled: Boolean(config.capi_enabled),
      missing_publish_scopes: missingPublishScopes,
      can_publish: row.provider === 'meta'
        ? Boolean(pageToken) && missingPublishScopes.length === 0
        : Boolean(token),
      masked_key: maskSensitiveValue(token),
    }
  })

  return { data: sanitized }
})
