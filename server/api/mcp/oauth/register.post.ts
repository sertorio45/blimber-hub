import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { registerDynamicOAuthClient } from '~/server/utils/blimber-mcp-oauth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    redirect_uris?: string[]
    grant_types?: string[]
    response_types?: string[]
    token_endpoint_auth_method?: string
  }>(event)

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter(uri => typeof uri === 'string')
    : []

  if (redirectUris.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'redirect_uris é obrigatório' })
  }

  const registration = registerDynamicOAuthClient(redirectUris)

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'no-store')
  return registration
})
