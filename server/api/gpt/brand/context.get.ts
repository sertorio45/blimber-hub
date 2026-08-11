import { defineEventHandler } from 'h3'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/**
 * Thin alias: brand context lives under marketing namespace in the MVP.
 * Prefer GET /api/gpt/marketing/brand-context?tenantId=
 */
export default defineEventHandler(async (event) => {
  assertBlimberMcpApiKey(event)
  // Re-dispatch by importing the marketing handler path logic via shared tool runner.
  const { optionalString, queryRecord, runMarketingGptTool } = await import('~/server/utils/blimber-gpt-api')
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_brand_context', {
    tenantId: optionalString(q.tenantId),
  })
})
