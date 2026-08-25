import { defineEventHandler, getRouterParam } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Detalhe de post editorial. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_post', {
    tenantId: optionalString(q.tenantId),
    postId: getRouterParam(event, 'postId'),
  })
})
