import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { createError, getHeader } from 'h3'

/**
 * Shared API-key gate for ChatGPT Actions (`/api/gpt/meta/*`) and the legacy
 * internal MCP HTTP bridge. ChatGPT Actions only support one auth scheme —
 * prefer Authorization: Bearer (configured as API Key → Bearer in the GPT editor).
 * `x-blimber-mcp-key` remains for local/scripts.
 */
export function resolveMetaGptApiSecret() {
  return process.env.BLIMBER_MCP_API_KEY
    || process.env.MARKETING_WORKER_SECRET
    || ''
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function extractMetaGptApiKey(event: H3Event): string {
  const headerKey = getHeader(event, 'x-blimber-mcp-key') || ''
  const auth = getHeader(event, 'authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  return headerKey || bearer
}

export function assertMetaGptApiKey(event: H3Event) {
  const expected = resolveMetaGptApiSecret()
  if (!expected) {
    throw createError({
      statusCode: 503,
      statusMessage: 'BLIMBER_MCP_API_KEY (ou MARKETING_WORKER_SECRET) não configurado',
    })
  }

  const provided = extractMetaGptApiKey(event)
  if (!provided || !secureEquals(provided, expected))
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })
}
