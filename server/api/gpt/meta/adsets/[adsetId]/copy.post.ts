import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalInt,
  optionalString,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Duplica adset Meta (dryRun default true; confirm + confirmTenantId). */
export default defineEventHandler(async (event) => {
  const adsetId = getRouterParam(event, 'adsetId')
  if (!adsetId) {
    throw createError({ statusCode: 400, statusMessage: 'adsetId obrigatório' })
  }

  const body = await readBody<Record<string, unknown>>(event)

  return runMetaGptTool(event, 'meta_copy_adset', {
    tenantId: optionalString(body.tenantId),
    adAccountId: optionalString(body.adAccountId),
    sourceAdsetId: adsetId,
    name: optionalString(body.name),
    campaignId: optionalString(body.campaignId),
    status: optionalString(body.status),
    dailyBudget: optionalInt(body.dailyBudget),
    lifetimeBudget: optionalInt(body.lifetimeBudget),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : undefined,
    dryRun: optionalBool(body.dryRun),
  })
})
