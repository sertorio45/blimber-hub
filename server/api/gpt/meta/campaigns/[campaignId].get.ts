import { createError, defineEventHandler, getRouterParam } from 'h3'
import {
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Detalhe de uma campanha Meta (valida ownership da ad account). */
export default defineEventHandler(async (event) => {
  const campaignId = getRouterParam(event, 'campaignId')
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId obrigatório' })
  }
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_get_campaign', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    campaignId,
  })
})
