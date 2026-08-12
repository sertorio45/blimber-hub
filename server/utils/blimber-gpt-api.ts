import type { H3Event } from 'h3'
import process from 'node:process'
import { readBody } from 'h3'
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
 * Reads JSON body for GPT mutations. Merges query params as fallback for
 * DELETE/PUT when proxies or clients strip the body (ChatGPT Actions).
 */
export async function readGptMutationBody(event: H3Event): Promise<Record<string, unknown>> {
  const query = queryRecord(event)
  let body: Record<string, unknown> = {}

  try {
    const raw = await readBody(event)
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
      body = raw as Record<string, unknown>
  }
  catch {
    // Empty or unsupported body — rely on query fallback below.
  }

  return { ...query, ...body }
}

/** Normalizes deletePost DELETE payload (body + optional query fallback). */
export function buildMarketingDeletePostArgs(
  postId: string | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tenantId: optionalString(payload.tenantId),
    postId,
    actorUserId: optionalString(payload.actorUserId),
    confirmTenantId: optionalString(payload.confirmTenantId),
    confirm: payload.confirm === true ? true : payload.confirm,
    dryRun: optionalBool(payload.dryRun),
  }
}

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
