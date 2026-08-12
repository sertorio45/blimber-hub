import { createServer } from 'node:http'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createBlimberMcpServer } from '../../../lib/blimber-mcp/create-server.ts'
import { createServiceSupabase, loadRepoEnv } from '../blimber-meta/src/env.ts'

const PORT = Number(process.env.BLIMBER_MCP_PORT || 8787)
const HOST = process.env.BLIMBER_MCP_HOST || '127.0.0.1'

function resolveApiKey(): string {
  return (
    process.env.BLIMBER_MCP_API_KEY
    || process.env.MARKETING_WORKER_SECRET
    || ''
  ).trim()
}

function extractBearer(req: import('node:http').IncomingMessage): string {
  const headerKey = String(req.headers['x-blimber-mcp-key'] || '')
  const auth = String(req.headers.authorization || '')
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  return headerKey || bearer
}

function secureEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function assertApiKey(req: import('node:http').IncomingMessage): boolean {
  const expected = resolveApiKey()
  if (!expected)
    return false
  const provided = extractBearer(req)
  return Boolean(provided && secureEquals(provided, expected))
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)

  if (!chunks.length)
    return undefined

  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

async function main() {
  loadRepoEnv()

  const expectedKey = resolveApiKey()
  if (!expectedKey) {
    console.error('[blimber-mcp] BLIMBER_MCP_API_KEY não configurada')
    process.exit(1)
  }

  const client = createServiceSupabase()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  const server = createBlimberMcpServer(
    client,
    process.env.BLIMBER_MCP_ACTOR_USER_ID || undefined,
  )
  await server.connect(transport)

  const httpServer = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, mcp-session-id, Mcp-Session-Id',
    )

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    if (!req.url?.startsWith('/mcp')) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Use POST/GET /mcp' }))
      return
    }

    if (!assertApiKey(req)) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Não autorizado' }))
      return
    }

    let parsedBody: unknown
    if (req.method === 'POST')
      parsedBody = await readJsonBody(req)

    await transport.handleRequest(req, res, parsedBody)
  })

  httpServer.listen(PORT, HOST, () => {
    console.error(`[blimber-mcp] Streamable HTTP em http://${HOST}:${PORT}/mcp`)
    console.error('[blimber-mcp] Auth: Bearer BLIMBER_MCP_API_KEY')
  })
}

main().catch((error) => {
  console.error('[blimber-mcp] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
