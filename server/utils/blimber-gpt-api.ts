import type { H3Event } from 'h3'
import process from 'node:process'
import { serverSupabaseServiceRole } from '#supabase/server'
import {
  formatBlimberMcpError,
  invokeMarketingTool,
  type MarketingToolName,
} from '~/lib/blimber-mcp'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'
import {
  optionalBool,
  optionalInt,
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

export { optionalBool, optionalInt, optionalString, queryRecord }

/**
 * Authenticate + invoke a Marketing tool, mapping errors to HTTP status.
 */
export async function runMarketingGptTool(
  event: H3Event,
  tool: MarketingToolName,
  args: Record<string, unknown>,
) {
  assertBlimberMcpApiKey(event)
  const client = createBlimberServiceRoleClient() || await serverSupabaseServiceRole(event)
  const actorUserId = process.env.BLIMBER_MCP_ACTOR_USER_ID || undefined

  try {
    const data = await invokeMarketingTool(tool, { client, actorUserId }, args)
    return { ok: true as const, tool, data }
  }
  catch (error) {
    const formatted = formatBlimberMcpError(error)
    event.node.res.statusCode = formatted.error.statusCode || 500
    return formatted
  }
}
