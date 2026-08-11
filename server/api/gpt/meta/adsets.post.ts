import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria adset Meta com targetingTemplate fechado.
 * Default PAUSED + dryRun=true. Exige confirm + confirmTenantId.
 * ACTIVE exige confirmActive=true. Budget (daily|lifetime) obrigatório.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_create_adset', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    campaignId: body.campaignId,
    name: body.name,
    targetingTemplate: body.targetingTemplate,
    billingEvent: body.billingEvent,
    optimizationGoal: body.optimizationGoal,
    status: body.status,
    dailyBudget: body.dailyBudget,
    lifetimeBudget: body.lifetimeBudget,
    startTime: body.startTime,
    endTime: body.endTime,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    confirmActive: body.confirmActive,
    dryRun: body.dryRun,
  })
})
