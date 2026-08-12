/**
 * Verifies Streamable HTTP stateless lifecycle: initialize then tools/list
 * must succeed on sequential HTTP requests (ChatGPT plugin flow).
 *
 * Regression: a singleton transport with sessionIdGenerator:undefined throws
 * "Stateless transport cannot be reused" after the first request → zero tools.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

function createMinimalMcpServer() {
  const server = new McpServer({ name: 'blimber-test', version: '0.0.0' })
  server.tool('searchTenants', 'Busca tenant', {}, async () => ({
    content: [{ type: 'text', text: '{"ok":true}' }],
  }))
  server.tool('meta_list_campaigns', 'Lista campanhas Meta', {}, async () => ({
    content: [{ type: 'text', text: '{"ok":true}' }],
  }))
  server.tool('marketing_list_posts', 'Lista posts', {}, async () => ({
    content: [{ type: 'text', text: '{"ok":true}' }],
  }))
  return server
}

async function handleWithFreshTransport(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createMinimalMcpServer()
  await server.connect(transport)
  try {
    await transport.handleRequest(req, res, parsedBody)
  }
  finally {
    await Promise.allSettled([transport.close(), server.close()])
  }
}

async function postJson(baseUrl: string, body: unknown) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  }
  catch {
    json = { raw: text }
  }
  return { status: response.status, json }
}

describe('blimber MCP Streamable HTTP lifecycle', () => {
  let baseUrl = ''
  let server: ReturnType<typeof createServer>

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      const chunks: Buffer[] = []
      for await (const chunk of req)
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      const raw = Buffer.concat(chunks).toString('utf8')
      const parsedBody = raw ? JSON.parse(raw) : undefined
      await handleWithFreshTransport(req, res, parsedBody)
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('failed to bind test server')
    baseUrl = `http://127.0.0.1:${address.port}/mcp`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
  })

  it('returns tools on tools/list after a separate initialize request', async () => {
    const init = await postJson(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
      },
    })

    expect(init.status).toBe(200)
    expect(init.json).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: { name: 'blimber-test' },
      },
    })

    const list = await postJson(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })

    expect(list.status).toBe(200)
    const tools = (list.json as { result?: { tools?: Array<{ name: string }> } })?.result?.tools
    expect(Array.isArray(tools)).toBe(true)
    expect(tools!.length).toBeGreaterThanOrEqual(3)
    expect(tools!.map(t => t.name)).toEqual(
      expect.arrayContaining(['searchTenants', 'meta_list_campaigns', 'marketing_list_posts']),
    )
  })
})
