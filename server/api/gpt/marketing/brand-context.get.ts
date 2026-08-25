import { defineEventHandler } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Lê Brand Context do Brand Center (tom, CTAs, restrições). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_brand_context', {
    tenantId: optionalString(q.tenantId),
  })
})
