import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, readBody, sendRedirect } from 'h3'
import { resolveMetaGptApiSecret } from '~/server/utils/meta-gpt-auth'
import {
  BLIMBER_MCP_OAUTH_SCOPE,
  createAuthorizationCode,
  getMcpRequestOrigin,
  resolveMcpPublicBaseUrl,
  resolveMcpResourceUrl,
  validateOAuthClientRedirect,
} from '~/server/utils/blimber-mcp-oauth'

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export default defineEventHandler(async (event) => {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  const body = await readBody<Record<string, string>>(event)

  const responseType = String(body.response_type || '')
  const clientId = String(body.client_id || '')
  const redirectUri = String(body.redirect_uri || '')
  const scope = String(body.scope || BLIMBER_MCP_OAUTH_SCOPE)
  const state = String(body.state || '')
  const codeChallenge = String(body.code_challenge || '')
  const codeChallengeMethod = String(body.code_challenge_method || 'S256')
  const resource = String(body.resource || resolveMcpResourceUrl(baseUrl))
  const apiKey = String(body.api_key || '').trim()

  if (responseType !== 'code') {
    throw createError({ statusCode: 400, statusMessage: 'response_type deve ser code' })
  }

  const expected = resolveMetaGptApiSecret()
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'BLIMBER_MCP_API_KEY não configurado no servidor' })
  }

  if (!apiKey || !secureEquals(apiKey, expected)) {
    const params = new URLSearchParams({
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      resource,
      error: 'Chave de API inválida. Verifique BLIMBER_MCP_API_KEY.',
    })
    return sendRedirect(event, `${baseUrl}/api/mcp/oauth/authorize?${params.toString()}`, 302)
  }

  const clientValid = await validateOAuthClientRedirect(clientId, redirectUri)
  if (!clientValid) {
    throw createError({ statusCode: 400, statusMessage: 'client_id ou redirect_uri inválidos' })
  }

  const code = createAuthorizationCode({
    baseUrl,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource,
    scope,
  })

  const redirect = new URL(redirectUri)
  redirect.searchParams.set('code', code)
  if (state)
    redirect.searchParams.set('state', state)

  return sendRedirect(event, redirect.toString(), 302)
})
