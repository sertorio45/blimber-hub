import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Lê Brand Context do Brand Center (tom, CTAs, restrições). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_brand_context', {
    tenantId: optionalString(q.tenantId),
  })
})
