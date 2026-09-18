import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { createError, getHeader, getQuery, readBody, readRawBody } from 'h3'
import { resolveMetaGptApiSecret } from '~/server/utils/meta-gpt-auth'

export const BLIMBER_MCP_OAUTH_SCOPE = 'mcp:tools'
export const BLIMBER_MCP_OAUTH_SCOPES = [BLIMBER_MCP_OAUTH_SCOPE] as const

const AUTH_CODE_TTL_SECONDS = 300
const ACCESS_TOKEN_TTL_SECONDS = 3600
/** ChatGPT MCP can silently renew access without full OAuth reconnect. */
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60
const CIMD_FETCH_TIMEOUT_MS = 8000

export const MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS
export const MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_SECONDS

type JwtPayload = Record<string, unknown>

export interface McpOAuthAuthInfo {
  token: string
  clientId: string
  scopes: string[]
  authMethod: 'oauth' | 'api_key'
}

function base64UrlEncode(input: Buffer | string) {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input
  return buffer.toString('base64url')
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url')
}

export function resolveMcpOAuthJwtSecret() {
  const explicit = (process.env.BLIMBER_MCP_OAUTH_JWT_SECRET || '').trim()
  if (explicit)
    return explicit

  const apiKey = resolveMetaGptApiSecret()
  if (!apiKey)
    return ''

  return createHash('sha256').update(`blimber-mcp-oauth:${apiKey}`).digest('hex')
}

export function resolveMcpPublicBaseUrl(origin?: string) {
  const fromEnv = (
    process.env.BLIMBER_MCP_PUBLIC_URL
    || process.env.NUXT_PUBLIC_API_URL
    || process.env.NUXT_PUBLIC_SITE_URL
    || ''
  ).trim().replace(/\/+$/, '')

  if (fromEnv)
    return fromEnv

  if (origin)
    return origin.replace(/\/+$/, '')

  return 'http://localhost:3000'
}

export function resolveMcpResourceUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/api/mcp`
}

export function resolveMcpOAuthIssuer(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/api/mcp/oauth`
}

export function protectedResourceMetadataPath() {
  return '/.well-known/oauth-protected-resource/api/mcp'
}

export function authorizationServerMetadataPath() {
  return '/.well-known/oauth-authorization-server/api/mcp/oauth'
}

export function buildProtectedResourceMetadata(baseUrl: string) {
  const resource = resolveMcpResourceUrl(baseUrl)
  const issuer = resolveMcpOAuthIssuer(baseUrl)

  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [...BLIMBER_MCP_OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl.replace(/\/+$/, '')}/docs/gpt-blimber-MCP-PLUGIN.md`,
  }
}

export function buildAuthorizationServerMetadata(baseUrl: string) {
  const issuer = resolveMcpOAuthIssuer(baseUrl)

  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    scopes_supported: [...BLIMBER_MCP_OAUTH_SCOPES],
  }
}

export function signMcpOAuthJwt(payload: JwtPayload, ttlSeconds: number) {
  const secret = resolveMcpOAuthJwtSecret()
  if (!secret)
    throw new Error('BLIMBER_MCP_OAUTH_JWT_SECRET or BLIMBER_MCP_API_KEY is required for OAuth tokens')

  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(body))
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyMcpOAuthJwt(token: string): JwtPayload | null {
  const secret = resolveMcpOAuthJwtSecret()
  if (!secret)
    return null

  const parts = token.split('.')
  if (parts.length !== 3)
    return null

  const [encodedHeader, encodedPayload, signature] = parts
  const expected = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as JwtPayload
    const exp = typeof payload.exp === 'number' ? payload.exp : 0
    if (exp <= Math.floor(Date.now() / 1000))
      return null
    return payload
  }
  catch {
    return null
  }
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method = 'S256') {
  if (!codeVerifier || !codeChallenge)
    return false

  if (method !== 'S256')
    return false

  const digest = createHash('sha256').update(codeVerifier).digest('base64url')
  const left = Buffer.from(digest)
  const right = Buffer.from(codeChallenge)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isChatGptRedirectUri(uri: string) {
  if (!uri.startsWith('https://'))
    return false

  try {
    const url = new URL(uri)
    if (url.hostname !== 'chatgpt.com')
      return false

    if (url.pathname === '/connector_platform_oauth_redirect')
      return true

    return /^\/connector\/oauth\/[^/]+$/.test(url.pathname)
  }
  catch {
    return false
  }
}

interface ClientMetadataDocument {
  client_id?: string
  redirect_uris?: string[]
  token_endpoint_auth_methods_supported?: string[]
}

export async function resolveOAuthClientRedirectUris(clientId: string): Promise<string[] | null> {
  if (!clientId.startsWith('https://'))
    return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(clientId, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok)
      return null

    const metadata = await response.json() as ClientMetadataDocument
    const redirectUris = Array.isArray(metadata.redirect_uris)
      ? metadata.redirect_uris.filter(uri => typeof uri === 'string')
      : []

    return redirectUris.length > 0 ? redirectUris : null
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function validateOAuthClientRedirect(clientId: string, redirectUri: string) {
  if (!isChatGptRedirectUri(redirectUri))
    return false

  if (clientId.startsWith('https://')) {
    const redirectUris = await resolveOAuthClientRedirectUris(clientId)
    if (!redirectUris)
      return false
    return redirectUris.includes(redirectUri)
  }

  // DCR public clients: allow any registered-looking opaque client id with ChatGPT redirect.
  return clientId.length >= 8
}

export function createAuthorizationCode(input: {
  baseUrl: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod?: string
  resource: string
  scope?: string
}) {
  const issuer = resolveMcpOAuthIssuer(input.baseUrl)
  return signMcpOAuthJwt({
    typ: 'auth_code',
    iss: issuer,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod || 'S256',
    resource: input.resource,
    scope: input.scope || BLIMBER_MCP_OAUTH_SCOPE,
  }, AUTH_CODE_TTL_SECONDS)
}

export function exchangeAuthorizationCode(input: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  resource: string
}) {
  const payload = verifyMcpOAuthJwt(input.code)
  if (!payload || payload.typ !== 'auth_code')
    throw createError({ statusCode: 400, statusMessage: 'Código de autorização inválido ou expirado' })

  if (payload.client_id !== input.clientId)
    throw createError({ statusCode: 400, statusMessage: 'client_id não corresponde ao código' })

  if (payload.redirect_uri !== input.redirectUri)
    throw createError({ statusCode: 400, statusMessage: 'redirect_uri não corresponde ao código' })

  if (payload.resource !== input.resource)
    throw createError({ statusCode: 400, statusMessage: 'resource não corresponde ao código' })

  const codeChallenge = String(payload.code_challenge || '')
  const codeChallengeMethod = String(payload.code_challenge_method || 'S256')
  if (!verifyPkce(input.codeVerifier, codeChallenge, codeChallengeMethod))
    throw createError({ statusCode: 400, statusMessage: 'PKCE inválido' })

  const scope = String(payload.scope || BLIMBER_MCP_OAUTH_SCOPE)
  const baseUrl = String(payload.iss || '').replace(/\/api\/mcp\/oauth$/, '')
  const resolvedBase = baseUrl || resolveMcpPublicBaseUrl()
  const resource = resolveMcpResourceUrl(resolvedBase)

  return issueMcpOAuthTokenPair({
    baseUrl: resolvedBase,
    clientId: input.clientId,
    scope,
    resource,
  })
}

export function issueMcpOAuthTokenPair(input: {
  baseUrl: string
  clientId: string
  scope: string
  resource: string
}) {
  const issuer = resolveMcpOAuthIssuer(input.baseUrl)
  const accessToken = signMcpOAuthJwt({
    typ: 'access',
    iss: issuer,
    aud: input.resource,
    sub: input.clientId,
    scope: input.scope,
    jti: base64UrlEncode(randomBytes(12)),
  }, ACCESS_TOKEN_TTL_SECONDS)

  const refreshToken = signMcpOAuthJwt({
    typ: 'refresh',
    iss: issuer,
    aud: input.resource,
    sub: input.clientId,
    scope: input.scope,
    jti: base64UrlEncode(randomBytes(12)),
  }, REFRESH_TOKEN_TTL_SECONDS)

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer' as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: input.scope,
  }
}

/**
 * Exchange a refresh JWT for a new access + refresh pair (90-day refresh TTL).
 */
export function exchangeRefreshToken(input: {
  refreshToken: string
  clientId: string
  resource: string
}) {
  const payload = verifyMcpOAuthJwt(input.refreshToken)
  if (!payload || payload.typ !== 'refresh')
    throw createError({ statusCode: 400, statusMessage: 'refresh_token inválido ou expirado' })

  if (payload.sub !== input.clientId)
    throw createError({ statusCode: 400, statusMessage: 'client_id não corresponde ao refresh_token' })

  const audience = payload.aud
  const audiences = Array.isArray(audience) ? audience : [audience]
  if (!audiences.map(String).includes(input.resource))
    throw createError({ statusCode: 400, statusMessage: 'resource não corresponde ao refresh_token' })

  const scope = String(payload.scope || BLIMBER_MCP_OAUTH_SCOPE)
  const baseUrl = String(payload.iss || '').replace(/\/api\/mcp\/oauth$/, '')
  const resolvedBase = baseUrl || resolveMcpPublicBaseUrl()

  return issueMcpOAuthTokenPair({
    baseUrl: resolvedBase,
    clientId: input.clientId,
    scope,
    resource: input.resource,
  })
}

export function verifyMcpAccessToken(token: string, resourceUrl: string) {
  const payload = verifyMcpOAuthJwt(token)
  if (!payload || payload.typ !== 'access')
    return null

  const audience = payload.aud
  const audiences = Array.isArray(audience) ? audience : [audience]
  if (!audiences.map(String).includes(resourceUrl))
    return null

  const scope = String(payload.scope || BLIMBER_MCP_OAUTH_SCOPE)
  return {
    clientId: String(payload.sub || 'chatgpt-mcp'),
    scopes: scope.split(/\s+/).filter(Boolean),
  }
}

export function buildMcpWwwAuthenticateHeader(baseUrl: string, scope = BLIMBER_MCP_OAUTH_SCOPE) {
  const metadataUrl = `${baseUrl.replace(/\/+$/, '')}${protectedResourceMetadataPath()}`
  return `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function extractBearerToken(event: H3Event) {
  const headerKey = getHeader(event, 'x-blimber-mcp-key') || ''
  const auth = getHeader(event, 'authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  return headerKey || bearer
}

export function assertMcpEndpointAuth(event: H3Event): McpOAuthAuthInfo {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  const resourceUrl = resolveMcpResourceUrl(baseUrl)
  const expectedApiKey = resolveMetaGptApiSecret()

  if (!expectedApiKey && !resolveMcpOAuthJwtSecret()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'BLIMBER_MCP_API_KEY não configurado',
    })
  }

  const token = extractBearerToken(event)
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Não autorizado',
      data: {
        wwwAuthenticate: buildMcpWwwAuthenticateHeader(baseUrl),
      },
    })
  }

  if (expectedApiKey && secureEquals(token, expectedApiKey)) {
    return {
      token,
      clientId: 'blimber-mcp-api-key',
      scopes: [...BLIMBER_MCP_OAUTH_SCOPES],
      authMethod: 'api_key',
    }
  }

  const oauth = verifyMcpAccessToken(token, resourceUrl)
  if (oauth) {
    return {
      token,
      clientId: oauth.clientId,
      scopes: oauth.scopes,
      authMethod: 'oauth',
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Não autorizado',
    data: {
      wwwAuthenticate: buildMcpWwwAuthenticateHeader(baseUrl),
    },
  })
}

export function getMcpRequestOrigin(event: H3Event) {
  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host') || ''
  const proto = getHeader(event, 'x-forwarded-proto') || 'https'
  if (!host)
    return undefined
  return `${proto}://${host}`
}

export function registerDynamicOAuthClient(redirectUris: string[]) {
  const valid = redirectUris.filter(isChatGptRedirectUri)
  if (valid.length === 0)
    throw createError({ statusCode: 400, statusMessage: 'redirect_uris inválidas para ChatGPT' })

  const clientId = base64UrlEncode(randomBytes(24))
  const issuedAt = Math.floor(Date.now() / 1000)

  return {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: valid,
  }
}

export async function readOAuthFormBody(event: H3Event) {
  const contentType = getHeader(event, 'content-type') || ''
  if (contentType.includes('application/json'))
    return await readBody<Record<string, string>>(event)

  const raw = await readRawBody(event, false)
  const text = typeof raw === 'string' ? raw : raw?.toString('utf8') || ''
  const params = new URLSearchParams(text)
  const result: Record<string, string> = {}
  for (const [key, value] of params.entries())
    result[key] = value
  return result
}

export function parseOAuthAuthorizeQuery(event: H3Event) {
  const query = getQuery(event)
  return {
    responseType: String(query.response_type || ''),
    clientId: String(query.client_id || ''),
    redirectUri: String(query.redirect_uri || ''),
    scope: String(query.scope || BLIMBER_MCP_OAUTH_SCOPE),
    state: String(query.state || ''),
    codeChallenge: String(query.code_challenge || ''),
    codeChallengeMethod: String(query.code_challenge_method || 'S256'),
    resource: String(query.resource || ''),
  }
}
