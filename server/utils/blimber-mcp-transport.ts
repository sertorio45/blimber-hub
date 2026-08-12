/**
 * Singleton Streamable HTTP transport for Blimber MCP (stateless, JSON responses).
 * Optimized for Vercel serverless — no long-lived SSE sessions.
 *
 * MCP SDK is loaded dynamically so `/api/mcp` does not break other Nitro routes.
 */

import process from 'node:process'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'

type StreamableTransport = import('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport

let transport: StreamableTransport | null = null
let readyPromise: Promise<StreamableTransport> | null = null

export async function getBlimberMcpTransport(): Promise<StreamableTransport> {
  if (transport)
    return transport

  if (!readyPromise) {
    readyPromise = (async () => {
      const [{ StreamableHTTPServerTransport }, { createBlimberMcpServer }] = await Promise.all([
        import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
        import('~/lib/blimber-mcp/create-server'),
      ])

      const client = createBlimberServiceRoleClient()
      if (!client) {
        throw new Error(
          'Supabase service role indisponível (SUPABASE_URL + SUPABASE_SERVICE_KEY).',
        )
      }

      const instance = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })

      const server = createBlimberMcpServer(
        client,
        process.env.BLIMBER_MCP_ACTOR_USER_ID || undefined,
      )

      await server.connect(instance)
      transport = instance
      return instance
    })()
  }

  return readyPromise
}

export function resetBlimberMcpTransportForTests() {
  transport = null
  readyPromise = null
}
