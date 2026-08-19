import { createError, defineEventHandler, getRouterParam } from 'h3'
import {
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Detalhe de um adset Meta (valida ownership da ad account). */
export default defineEventHandler(async (event) => {
  const adsetId = getRouterParam(event, 'adsetId')
  if (!adsetId) {
    throw createError({ statusCode: 400, statusMessage: 'adsetId obrigatório' })
  }
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_get_adset', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    adsetId,
  })
})
