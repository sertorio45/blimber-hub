/**
 * Unified Blimber MCP server — Marketing + Meta Ads + platform tools.
 * Shared by HTTP (ChatGPT plugin) and optional stdio/tunnel packages.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  formatToolError,
  invokeMetaTool,
  META_TOOL_DESCRIPTIONS,
  META_TOOL_SCHEMAS,
  type MetaToolName,
} from '../meta-ads'
import { invokeAdsGoogleTool } from './ads/google'
import { BLIMBER_MCP_VERSION, buildBlimberMcpRegistry } from './registry'
import { formatBlimberMcpError } from './errors'
import {
  invokeMarketingTool,
  MARKETING_TOOL_DESCRIPTIONS,
  MARKETING_TOOL_SCHEMAS,
  type MarketingToolName,
} from './marketing-tools'
import { searchTenants, searchTenantsSchema } from './platform/tenants'
import type { BlimberMcpToolContext } from './types'
import { zodObjectShape } from './zod-shape'

const PLATFORM_TOOL_NAMES = ['searchTenants', 'listBlimberTools'] as const
const GOOGLE_STUB_TOOL_NAMES = ['ads_google_status'] as const

export type BlimberMcpRemoteToolName =
  | typeof PLATFORM_TOOL_NAMES[number]
  | MarketingToolName
  | MetaToolName
  | typeof GOOGLE_STUB_TOOL_NAMES[number]

function toolTextPayload(payload: unknown, isError = false) {
  return {
    ...(isError ? { isError: true as const } : {}),
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  }
}

export function listBlimberMcpRemoteToolNames(): BlimberMcpRemoteToolName[] {
  return [
    ...PLATFORM_TOOL_NAMES,
    ...(Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]),
    ...(Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]),
    ...GOOGLE_STUB_TOOL_NAMES,
  ]
}

export function createBlimberMcpServer(
  client: SupabaseClient,
  actorUserId?: string,
) {
  const server = new McpServer({
    name: 'blimber',
    version: BLIMBER_MCP_VERSION,
  })

  const ctx: BlimberMcpToolContext = { client, actorUserId }

  server.tool(
    'searchTenants',
    'Busca tenant por nome/slug → id, name, slug (sem tokens).',
    zodObjectShape(searchTenantsSchema),
    async (args) => {
      try {
        const data = await searchTenants(client, args)
        return toolTextPayload({ ok: true, tool: 'searchTenants', data })
      }
      catch (error) {
        const formatted = formatBlimberMcpError(error)
        return toolTextPayload(formatted, true)
      }
    },
  )

  server.tool(
    'listBlimberTools',
    'Catálogo unificado de tools por domínio (marketing, ads.meta, crm stub…).',
    {},
    async () => {
      return toolTextPayload({
        ok: true,
        tool: 'listBlimberTools',
        data: buildBlimberMcpRegistry(),
      })
    },
  )

  for (const name of Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]) {
    const schema = MARKETING_TOOL_SCHEMAS[name]
    server.tool(
      name,
      MARKETING_TOOL_DESCRIPTIONS[name],
      zodObjectShape(schema),
      async (args) => {
        try {
          const data = await invokeMarketingTool(name, ctx, args as Record<string, unknown>)
          return toolTextPayload({ ok: true, tool: name, data })
        }
        catch (error) {
          const formatted = formatBlimberMcpError(error)
          return toolTextPayload(formatted, true)
        }
      },
    )
  }

  for (const name of Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]) {
    const schema = META_TOOL_SCHEMAS[name]
    server.tool(
      name,
      META_TOOL_DESCRIPTIONS[name],
      zodObjectShape(schema),
      async (args) => {
        try {
          const data = await invokeMetaTool(name, { client }, args)
          return toolTextPayload({ ok: true, tool: name, data })
        }
        catch (error) {
          const formatted = formatToolError(error)
          return toolTextPayload(formatted, true)
        }
      },
    )
  }

  server.tool(
    'ads_google_status',
    'Stub: status do adapter Google Ads (ainda não implementado).',
    zodObjectShape(z.object({
      tenantId: z.string().uuid().optional(),
    })),
    async (args) => {
      try {
        const data = await invokeAdsGoogleTool('ads_google_status', args)
        return toolTextPayload({ ok: true, tool: 'ads_google_status', data })
      }
      catch (error) {
        const formatted = formatBlimberMcpError(error)
        return toolTextPayload(formatted, true)
      }
    },
  )

  return server
}
