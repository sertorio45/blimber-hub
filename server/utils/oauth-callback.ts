import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

import process from 'node:process'
import { serverSupabaseServiceRole } from '#supabase/server'

import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { clearMarketingCampaignCacheForTenant, encryptSecret } from '~/server/utils/marketing'
import { recordSocialAudit } from '~/server/utils/social-audit'

export type OAuthProvider = 'google_ads' | 'google_analytics' | 'meta' | 'linkedin'

const PUBLISH_SCOPES = [
  'pages_manage_posts',
  'pages_show_list',
  'instagram_basic',
  'instagram_content_publish',
] as const

export function toOAuthProvider(value: string): OAuthProvider | null {
  if (value === 'google_ads' || value === 'google_analytics' || value === 'meta' || value === 'linkedin')
    return value
  return null
}

/**
 * True for the old shared Google callback (`/auth/google/callback`) that serves
 * both Ads and Analytics. Provider-specific paths must not use that override.
 */
function isSharedGoogleRedirectUri(uri: string): boolean {
  try {
    const path = new URL(uri).pathname.replace(/\/$/, '')
    return path === '/auth/google/callback' || path === '/api/oauth/google/callback'
  }
  catch {
    return false
  }
}

/**
 * Canonical browser callback for Meta/Google/LinkedIn — module-agnostic so CRM
 * CAPI and Marketing can share Redirect URIs in each provider console.
 *
 * Google Ads and Analytics share one OAuth client but use distinct callback
 * paths (`/api/oauth/google_ads|google_analytics/callback`) so the provider is
 * known from the URL. A single GOOGLE_REDIRECT_URI is only honored when it is
 * the legacy shared callback; otherwise per-provider paths win.
 */
export function resolveOAuthCallbackUrl(
  event: H3Event,
  provider: OAuthProvider,
): string {
  const requestUrl = getRequestURL(event)
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`

  if (provider === 'meta') {
    return process.env.META_REDIRECT_URI
      || process.env.META_OAUTH_REDIRECT_URI
      || `${baseUrl}/api/oauth/meta/callback`
  }

  if (provider === 'linkedin') {
    return process.env.LINKEDIN_REDIRECT_URI
      || `${baseUrl}/api/oauth/linkedin/callback`
  }

  const sharedGoogleRedirect
    = process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || ''

  // Legacy: one Redirect URI for Ads + Analytics (provider resolved at callback).
  if (sharedGoogleRedirect && isSharedGoogleRedirectUri(sharedGoogleRedirect))
    return sharedGoogleRedirect

  // Prefer request host so localhost/production stay in sync with the browser URL.
  // Optional per-provider overrides when a reverse proxy rewrites the public origin.
  if (provider === 'google_ads' && process.env.GOOGLE_ADS_REDIRECT_URI)
    return process.env.GOOGLE_ADS_REDIRECT_URI
  if (provider === 'google_analytics' && process.env.GOOGLE_ANALYTICS_REDIRECT_URI)
    return process.env.GOOGLE_ANALYTICS_REDIRECT_URI

  // Ignore non-shared GOOGLE_REDIRECT_URI (e.g. wrongly pointing at a single
  // provider path) — Ads and Analytics must not collide on one URI.
  return `${baseUrl}/api/oauth/${provider}/callback`
}

/** CRM Meta CAPI does not need social publish scopes to succeed. */
function isCapiRedirect(path: string | null | undefined): boolean {
  return Boolean(path && path.includes('meta-capi'))
}

export async function handleOAuthProviderCallback(
  event: H3Event,
  provider: OAuthProvider,
) {
  const failRedirect = (message: string, redirectBase = '/settings/integrations') =>
    sendRedirect(
      event,
      `${redirectBase}?oauth=error&message=${encodeURIComponent(message)}`,
      302,
    )

  const query = getQuery(event)
  const code = String(query.code || '')
  const state = String(query.state || '')
  if (!code || !state)
    throw createError({ statusCode: 400, statusMessage: 'Código OAuth inválido' })

  const client: any = await serverSupabaseServiceRole(event)
  const stateHash = createHash('sha256').update(state).digest('hex')
  const { data: oauthState } = await client
    .from('oauth_states')
    .select('id, tenant_id, user_id, provider, redirect_path, expires_at, consumed_at')
    .eq('state_hash', stateHash)
    .eq('provider', provider)
    .maybeSingle()

  const redirectBase = oauthState?.redirect_path || '/settings/integrations'

  if (
    !oauthState
    || oauthState.consumed_at
    || new Date(oauthState.expires_at).getTime() < Date.now()
  ) {
    return failRedirect('A sessão de autenticação expirou. Tente conectar novamente.', redirectBase)
  }

  const tenantId = String(oauthState.tenant_id)
  await client
    .from('oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', oauthState.id)

  const callbackUrl = resolveOAuthCallbackUrl(event, provider)

  let accessToken = ''
  let refreshToken = ''
  let expiresIn: number | null = null
  let grantedScopes: string[] = []
  let missingPublishScopes: string[] = []

  if (provider === 'meta') {
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      throw createError({ statusCode: 500, statusMessage: 'META_APP_ID/META_APP_SECRET não configurados' })
    }
    const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0'
    const tokenResponse = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      query: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: callbackUrl,
        code,
      },
    }).catch(() => null)
    if (!tokenResponse?.access_token) {
      return failRedirect('Falha ao obter token Meta. Verifique redirect URI e permissões do app.', redirectBase)
    }

    const shortLivedToken = tokenResponse.access_token as string
    const longLivedResponse = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    }).catch(() => null)
    accessToken = longLivedResponse?.access_token || shortLivedToken
    expiresIn = Number(longLivedResponse?.expires_in || tokenResponse?.expires_in || 0) || null

    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
    const debug = await $fetch<any>(`https://graph.facebook.com/${graphVersion}/debug_token`, {
      query: {
        input_token: accessToken,
        access_token: appToken,
      },
    }).catch(() => null)
    grantedScopes = (debug?.data?.scopes || []) as string[]
    missingPublishScopes = PUBLISH_SCOPES.filter(scope => !grantedScopes.includes(scope))
  }
  else if (provider === 'linkedin') {
    const clientId = process.env.LINKEDIN_CLIENT_ID || ''
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || ''
    if (!clientId || !clientSecret)
      throw createError({ statusCode: 500, statusMessage: 'Credenciais LinkedIn não configuradas' })

    const tokenResponse = await $fetch<any>('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }),
    }).catch(() => null)

    if (!tokenResponse?.access_token)
      return failRedirect('Falha ao obter token LinkedIn. Verifique o acesso ao Community Management API.', redirectBase)

    accessToken = tokenResponse.access_token
    refreshToken = tokenResponse.refresh_token || ''
    expiresIn = Number(tokenResponse.expires_in || 0) || null
  }
  else {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
    if (!googleClientId || !googleClientSecret) {
      throw createError({ statusCode: 500, statusMessage: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados' })
    }
    const tokenResponse = await $fetch<any>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    }).catch(() => null)
    if (!tokenResponse?.access_token) {
      return failRedirect('Falha ao obter token Google. Verifique redirect URI e credenciais.', redirectBase)
    }
    accessToken = tokenResponse.access_token || ''
    refreshToken = tokenResponse.refresh_token || ''
    expiresIn = Number(tokenResponse.expires_in || 0) || null

    // Persist granted scopes for Google Ads / Analytics diagnostics.
    const tokenInfo = await $fetch<{ scope?: string }>(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    ).catch(() => null)
    if (tokenInfo?.scope)
      grantedScopes = tokenInfo.scope.split(/\s+/).filter(Boolean)

    if (provider === 'google_analytics') {
      const hasAnalyticsReadonly = grantedScopes.some(scope =>
        scope === 'https://www.googleapis.com/auth/analytics.readonly'
        || scope === 'https://www.googleapis.com/auth/analytics',
      )
      if (!hasAnalyticsReadonly) {
        return failRedirect(
          'OAuth do Google Analytics sem escopo analytics.readonly. Reconecte o Google Analytics (não o Ads) e aceite as permissões.',
          redirectBase,
        )
      }
    }
  }

  if (!accessToken)
    throw createError({ statusCode: 400, statusMessage: 'Não foi possível obter access token' })

  const config: Record<string, any> = {
    access_token_enc: encryptSecret(accessToken),
    connected_by: oauthState.user_id,
  }
  if (refreshToken)
    config.refresh_token_enc = encryptSecret(refreshToken)
  if (expiresIn)
    config.token_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString()
  if (provider === 'meta') {
    config.granted_scopes = grantedScopes
    if (missingPublishScopes.length)
      config.missing_publish_scopes = missingPublishScopes
    else
      delete config.missing_publish_scopes
    // Page token must be refreshed after reconnecting.
    delete config.page_access_token_enc
  }
  if ((provider === 'google_ads' || provider === 'google_analytics') && grantedScopes.length)
    config.granted_scopes = grantedScopes

  const { data: existing } = await client
    .from('marketing_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .maybeSingle()

  const mergedConfig = { ...(existing?.config || {}), ...config }
  if (provider === 'meta' && !missingPublishScopes.length)
    delete mergedConfig.missing_publish_scopes

  const { error } = await client
    .from('marketing_integrations')
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        is_active: true,
        config: mergedConfig,
      },
      { onConflict: 'tenant_id,provider' },
    )

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message })

  await clearMarketingCampaignCacheForTenant(client, tenantId)

  await recordSocialAudit(event, client, {
    tenantId,
    actorId: oauthState.user_id,
    action: 'integration.connected',
    entityType: 'marketing_integration',
    after: {
      provider,
      grantedScopes: provider === 'meta' ? grantedScopes : undefined,
      missingPublishScopes: provider === 'meta' ? missingPublishScopes : undefined,
    },
  })

  // Publish scopes only matter for Marketing social posts — CAPI can succeed without them.
  if (provider === 'meta' && missingPublishScopes.length && !isCapiRedirect(redirectBase)) {
    const message = `Conectado, mas faltam permissões de publicação: ${missingPublishScopes.join(', ')}. Reconecte e aceite todas as permissões, ou solicite Advanced Access no app Meta.`
    return sendRedirect(event, `${redirectBase}?oauth=error&provider=meta&message=${encodeURIComponent(message)}`, 302)
  }

  return sendRedirect(event, `${redirectBase}?oauth=success&provider=${provider}`, 302)
}
