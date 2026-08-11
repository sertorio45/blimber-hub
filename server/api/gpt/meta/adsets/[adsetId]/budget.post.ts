import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Atualiza budget do adset (daily|lifetime).
 * dryRun default true. Exige confirm + confirmTenantId. Aumento % alto exige confirmBudgetIncrease.
 */
export default defineEventHandler(async (event) => {
  const adsetId = getRouterParam(event, 'adsetId')
  if (!adsetId) {
    throw createError({ statusCode: 400, statusMessage: 'adsetId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_adset_budget', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adsetId,
    dailyBudget: body.dailyBudget,
    lifetimeBudget: body.lifetimeBudget,
    endTime: body.endTime,
    confirmBudgetIncrease: body.confirmBudgetIncrease,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
