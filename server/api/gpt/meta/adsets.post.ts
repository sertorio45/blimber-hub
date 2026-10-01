import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria adset Meta com targetingTemplate BR_* OU targeting customizado (XOR).
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
    targeting: body.targeting,
    advantageAudience: body.advantageAudience,
    billingEvent: body.billingEvent,
    optimizationGoal: body.optimizationGoal,
    destinationType: body.destinationType,
    pixelId: body.pixelId,
    customEventType: body.customEventType,
    campaignObjective: body.campaignObjective,
    whatsappPhoneNumber: body.whatsappPhoneNumber,
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
