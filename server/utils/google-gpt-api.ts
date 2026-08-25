import type { H3Event } from 'h3'
import type { GoogleAdsToolName } from '~/lib/google-ads'
import { getQuery } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import {
  formatGoogleAdsToolError,
  GOOGLE_ADS_TOOL_DESCRIPTIONS,
  invokeGoogleAdsTool,
} from '~/lib/google-ads'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  return String(value)
}

export function optionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  const n = Number(value)
  if (!Number.isFinite(n))
    return undefined
  return Math.trunc(n)
}

export function queryRecord(event: H3Event): Record<string, unknown> {
  return getQuery(event) as Record<string, unknown>
}

/**
 * Authenticate + invoke a Google Ads MCP tool, mapping errors to HTTP status.
 */
export async function runGoogleGptTool(
  event: H3Event,
  tool: GoogleAdsToolName,
  args: Record<string, unknown>,
) {
  assertBlimberMcpApiKey(event)
  const client = await serverSupabaseServiceRole(event)

  try {
    const data = await invokeGoogleAdsTool(tool, { client }, args)
    return { ok: true as const, tool, data }
  }
  catch (error) {
    const formatted = formatGoogleAdsToolError(error)
    event.node.res.statusCode = formatted.error.statusCode || 500
    return formatted
  }
}

export function assertGoogleToolName(tool: string): GoogleAdsToolName {
  if (!tool || !(tool in GOOGLE_ADS_TOOL_DESCRIPTIONS)) {
    throw new Error(`tool inválida. Use: ${Object.keys(GOOGLE_ADS_TOOL_DESCRIPTIONS).join(', ')}`)
  }
  return tool as GoogleAdsToolName
}
