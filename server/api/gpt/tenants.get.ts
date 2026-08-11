import { defineEventHandler } from 'h3'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'
import { searchTenantsForGpt } from '~/server/utils/blimber-gpt-tenants'

/**
 * Shared administrative tenant search for the unified Blimber GPT.
 * Same semantics as GET /api/gpt/meta/tenants (kept for Meta-only pack).
 */
export default defineEventHandler(async (event) => {
  assertBlimberMcpApiKey(event)
  return searchTenantsForGpt(event)
})
