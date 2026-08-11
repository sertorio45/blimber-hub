import { defineEventHandler, getRouterParam } from 'h3'
import {
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Detalhe de post editorial. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_post', {
    tenantId: optionalString(q.tenantId),
    postId: getRouterParam(event, 'postId'),
  })
})
