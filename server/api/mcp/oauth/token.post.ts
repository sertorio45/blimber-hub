import { createError, defineEventHandler, setHeader } from 'h3'
import {
  exchangeAuthorizationCode,
  getMcpRequestOrigin,
  readOAuthFormBody,
  resolveMcpPublicBaseUrl,
  resolveMcpResourceUrl,
} from '~/server/utils/blimber-mcp-oauth'

export default defineEventHandler(async (event) => {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  const body = await readOAuthFormBody(event)

  const grantType = String(body.grant_type || '')
  if (grantType !== 'authorization_code') {
    throw createError({ statusCode: 400, statusMessage: 'grant_type não suportado' })
  }

  const code = String(body.code || '')
  const clientId = String(body.client_id || '')
  const redirectUri = String(body.redirect_uri || '')
  const codeVerifier = String(body.code_verifier || '')
  const resource = String(body.resource || resolveMcpResourceUrl(baseUrl))

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    throw createError({ statusCode: 400, statusMessage: 'Parâmetros de token incompletos' })
  }

  const tokenResponse = exchangeAuthorizationCode({
    code,
    clientId,
    redirectUri,
    codeVerifier,
    resource,
  })

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'no-store')
  return tokenResponse
})
