/**
 * Streamable HTTP transport for Blimber MCP (stateless, JSON responses).
 *
 * MCP SDK ≥1.x requires a **fresh** StreamableHTTPServerTransport per HTTP
 * request in stateless mode (`sessionIdGenerator: undefined`). Reusing a
 * singleton throws after the first call and ChatGPT ends up with zero tools
 * (initialize succeeds, tools/list fails on the warm instance).
 *
 * MCP SDK is loaded dynamically so `/api/mcp` does not break other Nitro routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'

type NodeRequestWithAuth = IncomingMessage & { auth?: AuthInfo }

async function loadMcpRuntime() {
  const [{ StreamableHTTPServerTransport }, { createBlimberMcpServer }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    import('~/lib/blimber-mcp/create-server'),
  ])
  return { StreamableHTTPServerTransport, createBlimberMcpServer }
}

/**
 * Handle one MCP Streamable HTTP request with a fresh server + transport.
 */
export async function handleBlimberMcpHttpRequest(
  req: NodeRequestWithAuth,
  res: ServerResponse,
  parsedBody?: unknown,
): Promise<void> {
  const client = createBlimberServiceRoleClient()
  if (!client) {
    throw new Error(
      'Supabase service role indisponível (SUPABASE_URL + SUPABASE_SERVICE_KEY).',
    )
  }

  const { StreamableHTTPServerTransport, createBlimberMcpServer } = await loadMcpRuntime()

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  const server = createBlimberMcpServer(
    client,
    process.env.BLIMBER_MCP_ACTOR_USER_ID || undefined,
  )

  await server.connect(transport)

  try {
    await transport.handleRequest(req, res, parsedBody)
  }
  finally {
    await Promise.allSettled([
      transport.close(),
      server.close(),
    ])
  }
}

/** @deprecated Use handleBlimberMcpHttpRequest — kept for test resets only. */
export function resetBlimberMcpTransportForTests() {
  // No singleton to reset; per-request lifecycle.
}
