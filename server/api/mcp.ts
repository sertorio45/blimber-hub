/**
 * Blimber MCP — Streamable HTTP endpoint for ChatGPT Developer Mode plugins.
 *
 * URL: POST/GET https://app.blimber.com.br/api/mcp
 * Auth: Authorization Bearer BLIMBER_MCP_API_KEY (same as GPT Actions)
 */

import type { H3Event } from 'h3'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createError, defineEventHandler, readRawBody, setResponseHeader, setResponseStatus } from 'h3'
import { assertBlimberMcpApiKey, extractBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'
import { getBlimberMcpTransport } from '~/server/utils/blimber-mcp-transport'

const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'mcp-session-id, Mcp-Session-Id',
}

function applyMcpCors(event: H3Event) {
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS))
    setResponseHeader(event, key, value)
}

function parseJsonBody(raw: string | Buffer | undefined): unknown {
  if (!raw || (typeof raw === 'string' && raw.length === 0))
    return undefined

  const text = typeof raw === 'string' ? raw : raw.toString('utf8')
  try {
    return JSON.parse(text)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Corpo JSON inválido' })
  }
}

export default defineEventHandler(async (event) => {
  applyMcpCors(event)

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }

  if (!['GET', 'POST', 'DELETE'].includes(event.method || '')) {
    throw createError({
      statusCode: 405,
      statusMessage: 'Método não permitido. Use GET, POST ou DELETE.',
    })
  }

  try {
    assertBlimberMcpApiKey(event)
  }
  catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'statusCode' in error
      && typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
      throw error
    }
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })
  }

  const transport = await getBlimberMcpTransport()

  let parsedBody: unknown
  if (event.method === 'POST') {
    const raw = await readRawBody(event, false)
    parsedBody = parseJsonBody(raw ?? undefined)
  }

  const token = extractBlimberMcpApiKey(event)
  const authInfo: AuthInfo = {
    token,
    clientId: 'blimber-mcp-api-key',
    scopes: ['mcp:tools'],
  }

  const req = event.node.req as typeof event.node.req & { auth?: AuthInfo }
  req.auth = authInfo

  await transport.handleRequest(req, event.node.res, parsedBody)

  if (event.node.res.writableEnded || event.node.res.headersSent)
    return undefined

  return null
})
