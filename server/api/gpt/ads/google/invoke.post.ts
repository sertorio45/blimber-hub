import { defineEventHandler, readBody, createError } from 'h3'
import { GOOGLE_ADS_TOOL_DESCRIPTIONS, type GoogleAdsToolName } from '~/lib/google-ads'
import { assertGoogleToolName, runGoogleGptTool } from '~/server/utils/google-gpt-api'

/**
 * Invoke genérico Google Ads MCP (fallback). Prefira rotas REST tipadas.
 * Body: { tool: GoogleAdsToolName, arguments?: object }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as {
    tool?: string
    arguments?: Record<string, unknown>
    args?: Record<string, unknown>
  }

  const toolRaw = String(body?.tool || '')
  if (!toolRaw || !(toolRaw in GOOGLE_ADS_TOOL_DESCRIPTIONS)) {
    throw createError({
      statusCode: 400,
      statusMessage: `tool inválida. Use: ${Object.keys(GOOGLE_ADS_TOOL_DESCRIPTIONS).join(', ')}`,
    })
  }

  const tool = assertGoogleToolName(toolRaw) as GoogleAdsToolName
  const args = body.arguments ?? body.args ?? {}
  return runGoogleGptTool(event, tool, args)
})
