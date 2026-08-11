import type { SupabaseClient } from '@supabase/supabase-js'
import type { MetaToolName } from '../../../lib/meta-ads/index.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { z } from 'zod'
import {
  formatToolError,
  invokeMetaTool,
  META_TOOL_DESCRIPTIONS,
  META_TOOL_SCHEMAS,

} from '../../../lib/meta-ads/index.ts'

const TOOL_NAMES = Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]

function zodObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject)
    return schema.shape
  const def = (schema as any)?._def
  if (def?.schema)
    return zodObjectShape(def.schema)
  if (def?.innerType)
    return zodObjectShape(def.innerType)
  return {}
}

export function createBlimberMetaMcpServer(client: SupabaseClient) {
  const server = new McpServer({
    name: 'blimber-meta',
    version: '0.1.0',
  })

  for (const name of TOOL_NAMES) {
    const schema = META_TOOL_SCHEMAS[name]
    const shape = zodObjectShape(schema)

    server.tool(
      name,
      META_TOOL_DESCRIPTIONS[name],
      shape,
      async (args) => {
        try {
          const result = await invokeMetaTool(name, { client }, args)
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ ok: true, data: result }, null, 2),
            }],
          }
        }
        catch (error) {
          const formatted = formatToolError(error)
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify(formatted, null, 2),
            }],
          }
        }
      },
    )
  }

  return server
}

export function listMetaToolNames() {
  return TOOL_NAMES.map(name => ({
    name,
    description: META_TOOL_DESCRIPTIONS[name],
  }))
}
