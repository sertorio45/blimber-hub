import type { H3Event } from 'h3'
import type { MetaToolName } from '~/lib/meta-ads'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getQuery } from 'h3'
import {
  formatToolError,
  invokeMetaTool,
} from '~/lib/meta-ads'
import { assertMetaGptApiKey } from '~/server/utils/meta-gpt-auth'

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

export function optionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  if (typeof value === 'boolean')
    return value
  const raw = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'sim'].includes(raw))
    return true
  if (['0', 'false', 'no', 'nao', 'não'].includes(raw))
    return false
  return undefined
}

export function queryRecord(event: H3Event): Record<string, unknown> {
  return getQuery(event) as Record<string, unknown>
}

/**
 * Authenticate + invoke a Meta tool, mapping tool errors to HTTP status.
 */
export async function runMetaGptTool(
  event: H3Event,
  tool: MetaToolName,
  args: Record<string, unknown>,
) {
  assertMetaGptApiKey(event)
  const client = await serverSupabaseServiceRole(event)

  try {
    const data = await invokeMetaTool(tool, { client }, args)
    return { ok: true as const, tool, data }
  }
  catch (error) {
    const formatted = formatToolError(error)
    event.node.res.statusCode = formatted.error.statusCode || 500
    return formatted
  }
}
