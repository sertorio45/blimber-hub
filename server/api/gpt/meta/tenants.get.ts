import { defineEventHandler } from 'h3'
import { assertMetaGptApiKey } from '~/server/utils/meta-gpt-auth'
import { searchTenantsForGpt } from '~/server/utils/blimber-gpt-tenants'

/**
 * Administrative tenant search for Custom GPT (Meta pack).
 * Auth: global Bearer BLIMBER_MCP_API_KEY.
 * Logic shared with GET /api/gpt/tenants (unified hub).
 */
export default defineEventHandler(async (event) => {
  assertMetaGptApiKey(event)
  return searchTenantsForGpt(event)
})
