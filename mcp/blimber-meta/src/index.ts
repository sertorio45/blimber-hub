#!/usr/bin/env node
/**
 * Blimber Meta Ads MCP server (stdio).
 *
 * Auth model: trusted local agent process using Supabase service role to read
 * marketing_integrations for the requested tenantId. Tokens never leave tool
 * handlers / are never returned in JSON payloads.
 *
 * Usage:
 *   pnpm mcp:meta
 *   # or from mcp/blimber-meta: pnpm start
 */

import process from 'node:process'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createBlimberMetaMcpServer } from './create-server.ts'
import { createServiceSupabase, loadRepoEnv } from './env.ts'

async function main() {
  loadRepoEnv()
  const client = createServiceSupabase()
  const server = createBlimberMetaMcpServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[blimber-meta] MCP server ready (stdio)')
}

main().catch((error) => {
  console.error('[blimber-meta] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
