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

/** Coerces confirm from JSON boolean or query string ("true"). */
export function parseConfirmTrue(value: unknown): unknown {
  if (value === true)
    return true
  if (optionalBool(value) === true)
    return true
  return value
}

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

/** Normalizes deletePost payload (POST body and/or query params). */
export function buildMarketingDeletePostArgs(
  postId: string | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tenantId: optionalString(payload.tenantId),
    postId,
    actorUserId: optionalString(payload.actorUserId),
    confirmTenantId: optionalString(payload.confirmTenantId),
    confirm: parseConfirmTrue(payload.confirm),
    dryRun: optionalBool(payload.dryRun),
  }
}

/** Shared handler for marketing_delete_post (DELETE + POST alias). */
export async function runMarketingDeletePost(
  event: H3Event,
  postId: string | undefined,
) {
  const payload = await readGptMutationBody(event)
  return runMarketingGptTool(
    event,
    'marketing_delete_post',
    buildMarketingDeletePostArgs(postId, payload),
  )
}

/** Normalizes deleteAsset payload (POST body and/or query params). */
export function buildMarketingDeleteAssetArgs(
  assetId: string | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tenantId: optionalString(payload.tenantId),
    assetId,
    actorUserId: optionalString(payload.actorUserId),
    confirmTenantId: optionalString(payload.confirmTenantId),
    confirm: parseConfirmTrue(payload.confirm),
    dryRun: optionalBool(payload.dryRun),
  }
}

/** Shared handler for marketing_delete_asset. */
export async function runMarketingDeleteAsset(
  event: H3Event,
  assetId: string | undefined,
) {
  const payload = await readGptMutationBody(event)
  return runMarketingGptTool(
    event,
    'marketing_delete_asset',
    buildMarketingDeleteAssetArgs(assetId, payload),
  )
}

/**
 * Authenticate + invoke a Marketing tool, mapping errors to HTTP status.
 */
function formatGptAuthError(error: unknown) {
  if (
    error
    && typeof error === 'object'
    && 'statusCode' in error
    && typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    const statusCode = (error as { statusCode: number }).statusCode
    const message = (
      'statusMessage' in error && typeof (error as { statusMessage?: unknown }).statusMessage === 'string'
        ? (error as { statusMessage: string }).statusMessage
        : 'Não autorizado'
    )
    return {
      ok: false as const,
      error: {
        code: statusCode === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
        message,
        statusCode,
      },
    }
  }
  return null
}

export async function runMarketingGptTool(
  event: H3Event,
  tool: MarketingToolName,
  args: Record<string, unknown>,
) {
  try {
    assertBlimberMcpApiKey(event)
  }
  catch (error) {
    const formatted = formatGptAuthError(error)
    if (formatted) {
      event.node.res.statusCode = formatted.error.statusCode
      return formatted
    }
    throw error
  }

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
