import type { MarketingToolName } from '~/lib/blimber-mcp'
import { MARKETING_TOOL_DESCRIPTIONS } from '~/lib/blimber-mcp'
import { defineEventHandler, readBody, createError } from 'h3'
import { runMarketingGptTool } from '~/server/utils/blimber-gpt-api'

/**
 * Invoke genérico (overflow). Prefira as rotas REST tipadas do OpenAPI.
 * Body: { tool: MarketingToolName, arguments?: object }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as {
    tool?: string
    arguments?: Record<string, unknown>
    args?: Record<string, unknown>
  }

  const tool = String(body?.tool || '') as MarketingToolName
  if (!tool || !(tool in MARKETING_TOOL_DESCRIPTIONS)) {
    throw createError({
      statusCode: 400,
      statusMessage: `tool inválida. Overflow: marketing_list_workflows, marketing_list_briefings, marketing_create_briefing_link, marketing_create_calendar_slot, marketing_update_calendar_slot, marketing_delete_calendar_slot.`,
    })
  }

  const args = body.arguments ?? body.args ?? {}
  return runMarketingGptTool(event, tool, args)
})
