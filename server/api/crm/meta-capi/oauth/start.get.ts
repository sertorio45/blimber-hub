import { createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createError, defineEventHandler, getQuery } from 'h3'

import { resolveOAuthCallbackUrl } from '~/server/utils/oauth-callback'
import {
  assertScopedTenantAccess,
  assertTenantModuleAccess,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'

/**
 * Meta OAuth for CAPI / shared Meta integration — no Marketing module required.
 * Uses the module-neutral `/api/oauth/meta/callback` (same Meta App as Marketing).
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

  const callbackUrl = resolveOAuthCallbackUrl(event, 'meta')

  const redirectPath = typeof query.redirect_path === 'string'
    && query.redirect_path.startsWith('/')
    && !query.redirect_path.startsWith('//')
    ? query.redirect_path
    : '/settings/integrations/meta-capi'

  const state = randomBytes(32).toString('base64url')
  const stateHash = createHash('sha256').update(state).digest('hex')

  const { error: stateError } = await client.from('oauth_states').insert({
    tenant_id: tenantId,
    user_id: user.id,
    provider: 'meta',
    state_hash: stateHash,
    redirect_path: redirectPath,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })

  if (stateError)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível iniciar a autenticação' })

  const clientId = process.env.META_APP_ID || ''
  if (!clientId)
    throw createError({ statusCode: 500, statusMessage: 'META_APP_ID não configurado' })

  // CRM-focused scopes + shared Marketing scopes (same Blimber app).
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

  // Prefer Facebook Login for Business dialog when available.
  const graphVersion = process.env.META_GRAPH_VERSION || 'v25.0'
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('auth_type', 'rerequest')
  url.searchParams.set('response_type', 'code')
  // Helps surface Business portfolio selection in newer Login flows.
  url.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID || '')
  if (!process.env.META_LOGIN_CONFIG_ID)
    url.searchParams.delete('config_id')

  return { redirectTo: url.toString() }
})
