import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria campanha Meta (Outcome_*). Default PAUSED + dryRun=true.
 * Exige confirm=true, confirmTenantId === tenantId.
 * ACTIVE exige confirmActive=true.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_create_campaign', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    name: body.name,
    objective: body.objective,
    status: body.status,
    dailyBudget: body.dailyBudget,
    lifetimeBudget: body.lifetimeBudget,
    specialAdCategories: body.specialAdCategories,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    confirmActive: body.confirmActive,
    dryRun: body.dryRun,
  })
})
