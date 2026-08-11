import { createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

import { createError, defineEventHandler, getQuery } from 'h3'

import { resolveOAuthCallbackUrl, toOAuthProvider } from '~/server/utils/oauth-callback'
import { requireSocialContext } from '~/server/utils/social-context'

export default defineEventHandler(async (event) => {
  const providerParam = event.context.params?.provider || ''
  const provider = toOAuthProvider(providerParam)
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Provider inválido' })
  }

  const { tenantId, user, client } = await requireSocialContext(
    event,
    'marketing.social.integrations',
  )

  const callbackUrl = resolveOAuthCallbackUrl(event, provider)
  const state = randomBytes(32).toString('base64url')
  const stateHash = createHash('sha256').update(state).digest('hex')

  const query = getQuery(event)
  const redirectPath = typeof query.redirect_path === 'string'
    && query.redirect_path.startsWith('/')
    && !query.redirect_path.startsWith('//')
    ? query.redirect_path
    : '/settings/integrations'

  const { error: stateError } = await client.from('oauth_states').insert({
    tenant_id: tenantId,
    user_id: user.id,
    provider,
    state_hash: stateHash,
    redirect_path: redirectPath,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })

  if (stateError)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível iniciar a autenticação' })

  if (provider === 'meta') {
    const clientId = process.env.META_APP_ID || ''
    if (!clientId) {
      throw createError({ statusCode: 500, statusMessage: 'META_APP_ID não configurado' })
    }
    // Facebook Login for Business / Instagram Graph API with Facebook Login.
    // End users (any tenant) authorize THEIR pages/IG — not only app admins.
    // Advanced Access in Meta App Review is required for non-tester accounts.
    const scopes = [
      'public_profile',
      'email',
      'business_management',
      'ads_read',
      'ads_management',
      'read_insights',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_manage_posts',
      'pages_read_user_content',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'instagram_manage_comments',
      'instagram_manage_contents',
    ].join(',')
    const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0'
    const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', callbackUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('scope', scopes)
    // Force permission dialog again so previously connected tenants re-grant publish scopes.
    url.searchParams.set('auth_type', 'rerequest')
    url.searchParams.set('response_type', 'code')
    return { redirectTo: url.toString() }
  }

  if (provider === 'linkedin') {
    const clientId = process.env.LINKEDIN_CLIENT_ID || ''
    if (!clientId)
      throw createError({ statusCode: 500, statusMessage: 'LINKEDIN_CLIENT_ID não configurado' })

    const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', callbackUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('scope', 'openid profile w_organization_social rw_organization_admin')
    return { redirectTo: url.toString() }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  if (!clientId) {
    throw createError({ statusCode: 500, statusMessage: 'GOOGLE_CLIENT_ID não configurado' })
  }
  const scopes
    = provider === 'google_ads'
      ? ['https://www.googleapis.com/auth/adwords']
      : ['https://www.googleapis.com/auth/analytics.readonly']

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleUrl.searchParams.set('client_id', clientId)
  googleUrl.searchParams.set('redirect_uri', callbackUrl)
  googleUrl.searchParams.set('response_type', 'code')
  googleUrl.searchParams.set('access_type', 'offline')
  googleUrl.searchParams.set('prompt', 'consent')
  googleUrl.searchParams.set('include_granted_scopes', 'true')
  googleUrl.searchParams.set('scope', scopes.join(' '))
  googleUrl.searchParams.set('state', state)
  return { redirectTo: googleUrl.toString() }
})
