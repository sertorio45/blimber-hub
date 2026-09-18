import { createHash } from 'node:crypto'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  BLIMBER_MCP_OAUTH_SCOPE,
  buildAuthorizationServerMetadata,
  buildMcpWwwAuthenticateHeader,
  buildProtectedResourceMetadata,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  isChatGptRedirectUri,
  MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
  protectedResourceMetadataPath,
  authorizationServerMetadataPath,
  registerDynamicOAuthClient,
  resolveMcpOAuthJwtSecret,
  resolveMcpPublicBaseUrl,
  resolveMcpResourceUrl,
  signMcpOAuthJwt,
  verifyMcpAccessToken,
  verifyMcpOAuthJwt,
  verifyPkce,
} from '../server/utils/blimber-mcp-oauth'

const BASE_URL = 'https://app.blimber.com.br'
const RESOURCE = `${BASE_URL}/api/mcp`

describe('blimber MCP OAuth', () => {
  const previousApiKey = process.env.BLIMBER_MCP_API_KEY
  const previousJwtSecret = process.env.BLIMBER_MCP_OAUTH_JWT_SECRET

  beforeEach(() => {
    process.env.BLIMBER_MCP_API_KEY = 'test-mcp-api-key'
    delete process.env.BLIMBER_MCP_OAUTH_JWT_SECRET
  })

  afterEach(() => {
    if (previousApiKey === undefined)
      delete process.env.BLIMBER_MCP_API_KEY
    else
      process.env.BLIMBER_MCP_API_KEY = previousApiKey

    if (previousJwtSecret === undefined)
      delete process.env.BLIMBER_MCP_OAUTH_JWT_SECRET
    else
      process.env.BLIMBER_MCP_OAUTH_JWT_SECRET = previousJwtSecret
  })

  it('builds RFC9728 protected resource metadata for /api/mcp', () => {
    const metadata = buildProtectedResourceMetadata(BASE_URL)

    expect(metadata.resource).toBe(RESOURCE)
    expect(metadata.authorization_servers).toEqual([`${BASE_URL}/api/mcp/oauth`])
    expect(metadata.scopes_supported).toContain(BLIMBER_MCP_OAUTH_SCOPE)
    expect(protectedResourceMetadataPath()).toBe('/.well-known/oauth-protected-resource/api/mcp')
  })

  it('builds RFC8414 authorization server metadata with PKCE and DCR', () => {
    const metadata = buildAuthorizationServerMetadata(BASE_URL)

    expect(metadata.issuer).toBe(`${BASE_URL}/api/mcp/oauth`)
    expect(metadata.authorization_endpoint).toBe(`${BASE_URL}/api/mcp/oauth/authorize`)
    expect(metadata.token_endpoint).toBe(`${BASE_URL}/api/mcp/oauth/token`)
    expect(metadata.registration_endpoint).toBe(`${BASE_URL}/api/mcp/oauth/register`)
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
    expect(metadata.client_id_metadata_document_supported).toBe(true)
    expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(authorizationServerMetadataPath()).toBe('/.well-known/oauth-authorization-server/api/mcp/oauth')
  })

  it('signs and verifies JWT access tokens bound to the MCP resource audience', () => {
    const token = signMcpOAuthJwt({
      typ: 'access',
      iss: `${BASE_URL}/api/mcp/oauth`,
      aud: RESOURCE,
      sub: 'chatgpt-client',
      scope: BLIMBER_MCP_OAUTH_SCOPE,
    }, 3600)

    const payload = verifyMcpOAuthJwt(token)
    expect(payload?.typ).toBe('access')
    expect(payload?.aud).toBe(RESOURCE)

    const verified = verifyMcpAccessToken(token, RESOURCE)
    expect(verified?.clientId).toBe('chatgpt-client')
    expect(verified?.scopes).toContain(BLIMBER_MCP_OAUTH_SCOPE)
    expect(verifyMcpAccessToken(token, 'https://other.example/api/mcp')).toBeNull()
  })

  it('derives JWT secret from BLIMBER_MCP_API_KEY when explicit secret is absent', () => {
    const secret = resolveMcpOAuthJwtSecret()
    const expected = createHash('sha256').update('blimber-mcp-oauth:test-mcp-api-key').digest('hex')
    expect(secret).toBe(expected)
  })

  it('validates PKCE S256 challenges', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    expect(verifyPkce(verifier, challenge)).toBe(true)
    expect(verifyPkce('wrong-verifier', challenge)).toBe(false)
  })

  it('exchanges authorization code for access + refresh tokens with PKCE', () => {
    const redirectUri = 'https://chatgpt.com/connector/oauth/test-callback'
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    const clientId = 'test-client-id'

    const code = createAuthorizationCode({
      baseUrl: BASE_URL,
      clientId,
      redirectUri,
      codeChallenge: challenge,
      resource: RESOURCE,
    })

    const tokenResponse = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier: verifier,
      resource: RESOURCE,
    })

    expect(tokenResponse.token_type).toBe('Bearer')
    expect(tokenResponse.access_token.split('.')).toHaveLength(3)
    expect(tokenResponse.refresh_token.split('.')).toHaveLength(3)
    expect(tokenResponse.expires_in).toBe(3600)
    expect(verifyMcpAccessToken(tokenResponse.access_token, RESOURCE)?.clientId).toBe(clientId)

    const refreshPayload = verifyMcpOAuthJwt(tokenResponse.refresh_token)
    expect(refreshPayload?.typ).toBe('refresh')
    expect(refreshPayload?.sub).toBe(clientId)
    expect(refreshPayload?.aud).toBe(RESOURCE)
    expect(MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS).toBe(90 * 24 * 60 * 60)
  })

  it('exchanges refresh_token for a new access + refresh pair', () => {
    const redirectUri = 'https://chatgpt.com/connector/oauth/test-callback'
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    const clientId = 'test-client-id'

    const code = createAuthorizationCode({
      baseUrl: BASE_URL,
      clientId,
      redirectUri,
      codeChallenge: challenge,
      resource: RESOURCE,
    })

    const initial = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier: verifier,
      resource: RESOURCE,
    })

    const renewed = exchangeRefreshToken({
      refreshToken: initial.refresh_token,
      clientId,
      resource: RESOURCE,
    })

    expect(renewed.access_token).toBeTruthy()
    expect(renewed.refresh_token).toBeTruthy()
    expect(renewed.access_token).not.toBe(initial.access_token)
    expect(verifyMcpAccessToken(renewed.access_token, RESOURCE)?.clientId).toBe(clientId)
    expect(verifyMcpOAuthJwt(renewed.refresh_token)?.typ).toBe('refresh')
  })

  it('rejects refresh_token with mismatched client_id', () => {
    const redirectUri = 'https://chatgpt.com/connector/oauth/test-callback'
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    const clientId = 'test-client-id'

    const code = createAuthorizationCode({
      baseUrl: BASE_URL,
      clientId,
      redirectUri,
      codeChallenge: challenge,
      resource: RESOURCE,
    })

    const initial = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier: verifier,
      resource: RESOURCE,
    })

    expect(() => exchangeRefreshToken({
      refreshToken: initial.refresh_token,
      clientId: 'other-client',
      resource: RESOURCE,
    })).toThrow()
  })

  it('accepts ChatGPT redirect URIs for DCR and rejects arbitrary hosts', () => {
    expect(isChatGptRedirectUri('https://chatgpt.com/connector/oauth/abc123')).toBe(true)
    expect(isChatGptRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true)
    expect(isChatGptRedirectUri('https://evil.example/connector/oauth/x')).toBe(false)

    const registration = registerDynamicOAuthClient([
      'https://chatgpt.com/connector/oauth/instance-1',
    ])

    expect(registration.client_id).toBeTruthy()
    expect(registration.token_endpoint_auth_method).toBe('none')
    expect(registration.grant_types).toContain('refresh_token')
  })

  it('builds WWW-Authenticate challenge with resource metadata URL', () => {
    const header = buildMcpWwwAuthenticateHeader(BASE_URL)
    expect(header).toContain('resource_metadata=')
    expect(header).toContain(protectedResourceMetadataPath())
    expect(header).toContain(BLIMBER_MCP_OAUTH_SCOPE)
  })

  it('resolves canonical MCP resource URL from public base', () => {
    expect(resolveMcpResourceUrl(BASE_URL)).toBe(RESOURCE)
    expect(resolveMcpPublicBaseUrl('https://app.blimber.com.br/')).toBe('https://app.blimber.com.br')
  })
})
