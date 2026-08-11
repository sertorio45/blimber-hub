import type { MetaToolName } from '~/lib/meta-ads'
import { defineEventHandler, readBody, createError } from 'h3'
import { META_TOOL_DESCRIPTIONS } from '~/lib/meta-ads'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Invoke genérico (fallback). Prefira as rotas REST tipadas do OpenAPI.
 * Body: { tool: MetaToolName, arguments?: object }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as {
    tool?: string
    arguments?: Record<string, unknown>
    args?: Record<string, unknown>
  }

  const tool = String(body?.tool || '') as MetaToolName
  if (!tool || !(tool in META_TOOL_DESCRIPTIONS)) {
    throw createError({
      statusCode: 400,
      statusMessage: `tool inválida. Use: ${Object.keys(META_TOOL_DESCRIPTIONS).join(', ')}`,
    })
  }

  const args = body.arguments ?? body.args ?? {}
  return runMetaGptTool(event, tool, args)
})
