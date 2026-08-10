import { createHash } from 'node:crypto'

import { serverSupabaseServiceRole } from '#supabase/server'
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

import type { OAuthProvider } from '~/server/utils/oauth-callback'
import { toOAuthProvider } from '~/server/utils/oauth-callback'

/**
 * Legacy shared Google Redirect URI (`/auth/google/callback`).
 * Prefer `/api/oauth/google_ads|google_analytics/callback` in Google Cloud Console.
 * Resolves the provider from `oauth_states` (state is opaque random bytes).
 */
export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const query = requestUrl.search || ''
  const state = requestUrl.searchParams.get('state') || ''

  let provider: OAuthProvider = 'google_ads'

  if (state) {
    const client: any = await serverSupabaseServiceRole(event)
    const stateHash = createHash('sha256').update(state).digest('hex')
    const { data: oauthState } = await client
      .from('oauth_states')
      .select('provider')
      .eq('state_hash', stateHash)
      .is('consumed_at', null)
      .maybeSingle()

    const resolved = toOAuthProvider(String(oauthState?.provider || ''))
    if (resolved === 'google_ads' || resolved === 'google_analytics')
      provider = resolved
  }

  return sendRedirect(event, `/api/oauth/${provider}/callback${query}`, 302)
})
