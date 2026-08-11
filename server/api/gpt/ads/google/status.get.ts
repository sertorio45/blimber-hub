import { defineEventHandler, getQuery } from 'h3'
import { adsGoogleStatus } from '~/lib/blimber-mcp'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/** Stub Google Ads — documented coming soon. */
export default defineEventHandler(async (event) => {
  assertBlimberMcpApiKey(event)
  const q = getQuery(event)
  return adsGoogleStatus({
    tenantId: typeof q.tenantId === 'string' ? q.tenantId : undefined,
  })
})
