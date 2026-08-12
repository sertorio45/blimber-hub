import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createBlimberMcpServer, listBlimberMcpRemoteToolNames } from '../lib/blimber-mcp/create-server'

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m && !process.env[m[1].trim()])
    process.env[m[1].trim()] = m[2].trim()
}

async function main() {
  const names = listBlimberMcpRemoteToolNames()
  console.log('registered tool count:', names.length)

  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  })

  async function handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, body: unknown) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const server = createBlimberMcpServer(client, process.env.BLIMBER_MCP_ACTOR_USER_ID)
    await server.connect(transport)
    try {
      await transport.handleRequest(req, res, body)
    }
    finally {
      await Promise.allSettled([transport.close(), server.close()])
    }
  }

  const srv = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req)
      chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
    const raw = Buffer.concat(chunks).toString('utf8')
    await handle(req, res, raw ? JSON.parse(raw) : undefined)
  })

  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()))
  const port = (srv.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}/mcp`

  async function rpc(id: number, method: string, params: Record<string, unknown> = {}) {
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    return { status: res.status, body: await res.json() as any }
  }

  const init = await rpc(1, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '1' },
  })
  console.log('initialize', init.status, init.body?.result?.serverInfo)

  const list = await rpc(2, 'tools/list')
  const tools = list.body?.result?.tools || []
  console.log('tools/list', list.status, 'count', tools.length)
  const want = ['searchTenants', 'listBlimberTools', 'marketing_list_posts', 'meta_list_campaigns', 'ads_google_status']
  for (const w of want)
    console.log(w, tools.some((t: { name: string }) => t.name === w))

  if (tools.length !== names.length) {
    console.error('count mismatch', tools.length, names.length)
    process.exitCode = 1
  }
  else {
    console.log('SMOKE OK')
  }
  srv.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
