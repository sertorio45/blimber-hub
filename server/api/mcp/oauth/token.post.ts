import { createError, defineEventHandler, setHeader } from 'h3'
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getMcpRequestOrigin,
  readOAuthFormBody,
  resolveMcpPublicBaseUrl,
  resolveMcpResourceUrl,
} from '~/server/utils/blimber-mcp-oauth'

export default defineEventHandler(async (event) => {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  const body = await readOAuthFormBody(event)

  const grantType = String(body.grant_type || '')
  const clientId = String(body.client_id || '')
  const resource = String(body.resource || resolveMcpResourceUrl(baseUrl))

  let tokenResponse: Record<string, unknown>

  if (grantType === 'authorization_code') {
    const code = String(body.code || '')
    const redirectUri = String(body.redirect_uri || '')
    const codeVerifier = String(body.code_verifier || '')

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      throw createError({ statusCode: 400, statusMessage: 'Parâmetros de token incompletos' })
    }

    tokenResponse = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
      resource,
    })
  }
  else if (grantType === 'refresh_token') {
    const refreshToken = String(body.refresh_token || '')
    if (!refreshToken || !clientId) {
      throw createError({ statusCode: 400, statusMessage: 'Parâmetros de refresh incompletos' })
    }

    tokenResponse = exchangeRefreshToken({
      refreshToken,
      clientId,
      resource,
    })
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'grant_type não suportado' })
  }

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'no-store')
  return tokenResponse
})
