/**
 * Unified Blimber MCP server — Marketing + Meta Ads + platform tools.
 * Shared by HTTP (ChatGPT plugin) and optional stdio/tunnel packages.
 *
 * Registration order: platform → Meta Ads → Marketing → Google stub.
 * Meta writes (create_campaign/adset/ad) stay early so ChatGPT connectors
 * with soft tool caps still keep them invocable.
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
import { resolveBlimberMcpToolName } from './tool-name'
import type { BlimberMcpToolContext } from './types'
import { zodObjectShape } from './zod-shape'

const PLATFORM_TOOL_NAMES = ['searchTenants', 'listBlimberTools'] as const
const GOOGLE_STUB_TOOL_NAMES = ['ads_google_status'] as const

export type BlimberMcpRemoteToolName =
  | typeof PLATFORM_TOOL_NAMES[number]
  | MarketingToolName
  | MetaToolName
  | typeof GOOGLE_STUB_TOOL_NAMES[number]

type RegisteredToolsMap = Record<string, unknown>

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
    ...(Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]),
    ...(Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]),
    ...GOOGLE_STUB_TOOL_NAMES,
  ]
}

/**
 * ChatGPT may call tools/call with `Blimber_Hub.meta_create_ad` (or ads_meta_ /
 * OpenAPI aliases). MCP SDK looks up `_registeredTools[name]` literally —
 * install a Proxy so alias names resolve to the canonical registration.
 */
function installToolNameAliasResolver(server: McpServer, knownNames: string[]) {
  const known = new Set(knownNames)
  const host = server as unknown as { _registeredTools: RegisteredToolsMap }
  const target = host._registeredTools

  host._registeredTools = new Proxy(target, {
    get(map, prop, receiver) {
      if (typeof prop !== 'string')
        return Reflect.get(map, prop, receiver)

      if (Object.prototype.hasOwnProperty.call(map, prop))
        return map[prop]

      const resolved = resolveBlimberMcpToolName(prop, known)
      if (resolved && Object.prototype.hasOwnProperty.call(map, resolved))
        return map[resolved]

      return Reflect.get(map, prop, receiver)
    },
  })
}

/** Expose each tool as an MCP resource so clients that probe resources/list succeed. */
function registerToolCatalogResources(
  server: McpServer,
  tools: Array<{ name: string, description: string }>,
) {
  server.registerResource(
    'blimber_tools_catalog',
    'blimber://tools',
    {
      description: 'Catálogo das tools MCP (use tools/call com o nome canônico, sem prefixo Blimber_Hub.).',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({
          invoke: 'tools/call',
          note: 'Nomes canônicos sem prefixo de conector. Ex.: meta_create_ad (não Blimber_Hub.meta_create_ad).',
          tools: tools.map(t => t.name),
        }, null, 2),
      }],
    }),
  )

  for (const tool of tools) {
    const uri = `blimber://tools/${tool.name}`
    server.registerResource(
      tool.name,
      uri,
      {
        description: `${tool.description} Invocar via tools/call name="${tool.name}".`,
        mimeType: 'application/json',
      },
      async (resourceUri) => ({
        contents: [{
          uri: resourceUri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            type: 'mcp_tool',
            name: tool.name,
            description: tool.description,
            invoke: {
              method: 'tools/call',
              name: tool.name,
              note: 'Não use resources/read para executar. Não prefixe com Blimber_Hub.',
            },
          }, null, 2),
        }],
      }),
    )
  }
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
  const registeredMeta: Array<{ name: string, description: string }> = []

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

  // Meta before Marketing: keep create_campaign / create_adset / create_ad early.
  for (const name of Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]) {
    const schema = META_TOOL_SCHEMAS[name]
    const description = META_TOOL_DESCRIPTIONS[name]
    registeredMeta.push({ name, description })
    server.tool(
      name,
      description,
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

  const knownNames = listBlimberMcpRemoteToolNames()
  installToolNameAliasResolver(server, knownNames)

  registerToolCatalogResources(
    server,
    [
      { name: 'searchTenants', description: 'Busca tenant por nome/slug.' },
      { name: 'listBlimberTools', description: 'Catálogo unificado de tools.' },
      ...registeredMeta,
      ...(Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]).map(name => ({
        name,
        description: MARKETING_TOOL_DESCRIPTIONS[name],
      })),
      { name: 'ads_google_status', description: 'Stub Google Ads.' },
    ],
  )

  return server
}
