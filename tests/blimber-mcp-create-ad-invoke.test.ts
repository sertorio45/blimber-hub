/**
 * Regression: meta_create_ad must appear in tools/list and resolve via tools/call
 * (canonical name, ChatGPT Blimber_Hub. prefix, and OpenAPI createAd alias).
 */

import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createBlimberMcpServer, listBlimberMcpRemoteToolNames } from '../lib/blimber-mcp/create-server'
import {
  resolveBlimberMcpToolName,
  stripMcpConnectorNamespace,
} from '../lib/blimber-mcp/tool-name'

describe('resolveBlimberMcpToolName', () => {
  const known = listBlimberMcpRemoteToolNames()

  it('strips ChatGPT connector namespace', () => {
    expect(stripMcpConnectorNamespace('Blimber_Hub.meta_create_ad')).toBe('meta_create_ad')
    expect(stripMcpConnectorNamespace('meta_create_ad')).toBe('meta_create_ad')
    expect(stripMcpConnectorNamespace('/Blimber_Hub/link_abc123/meta_create_ad')).toBe('meta_create_ad')
  })

  it('resolves prefixed, ads_meta_ and OpenAPI aliases', () => {
    expect(resolveBlimberMcpToolName('meta_create_ad', known)).toBe('meta_create_ad')
    expect(resolveBlimberMcpToolName('Blimber_Hub.meta_create_ad', known)).toBe('meta_create_ad')
    expect(resolveBlimberMcpToolName('ads_meta_create_ad', known)).toBe('meta_create_ad')
    expect(resolveBlimberMcpToolName('ads_meta_create_ad_from_instagram_post', known)).toBe('meta_create_ad_from_instagram_post')
    expect(resolveBlimberMcpToolName('createAd', known)).toBe('meta_create_ad')
    expect(resolveBlimberMcpToolName('Blimber_Hub.createAd', known)).toBe('meta_create_ad')
    expect(resolveBlimberMcpToolName('uploadMediaAsset', known)).toBe('marketing_upload_asset')
    expect(resolveBlimberMcpToolName('not_a_tool', known)).toBeNull()
  })
})

describe('blimber MCP meta_create_ad invoke', () => {
  let client: Client
  let close: () => Promise<void>

  beforeAll(async () => {
    const supabase = createClient('http://127.0.0.1:54321', 'test-service-role-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const server = createBlimberMcpServer(supabase)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    client = new Client({ name: 'vitest', version: '1.0.0' })
    await client.connect(clientTransport)
    close = async () => {
      await Promise.allSettled([client.close(), server.close()])
    }
  })

  afterAll(async () => {
    await close?.()
  })

  it('lists meta_create_ad before marketing tools and exposes tool resources', async () => {
    const listed = await client.listTools()
    const names = listed.tools.map(t => t.name)

    expect(names).toContain('meta_create_ad')
    expect(names).toContain('meta_create_campaign')
    expect(names).toContain('meta_create_adset')
    expect(names).toContain('meta_list_instagram_accounts')
    expect(names).toContain('meta_list_instagram_media')
    expect(names).toContain('meta_get_instagram_media')
    expect(names).toContain('meta_create_ad_from_instagram_post')

    const createAdIdx = names.indexOf('meta_create_ad')
    const marketingIdx = names.findIndex(n => n.startsWith('marketing_'))
    expect(createAdIdx).toBeGreaterThan(-1)
    expect(marketingIdx).toBeGreaterThan(-1)
    expect(createAdIdx).toBeLessThan(marketingIdx)

    const adTool = listed.tools.find(t => t.name === 'meta_create_ad')
    expect(adTool?.inputSchema?.properties).toHaveProperty('creativeType')
    expect(adTool?.inputSchema?.properties).toHaveProperty('adsetId')
    expect(adTool?.inputSchema?.properties).toHaveProperty('instagramMediaId')
    expect(adTool?.inputSchema?.properties).toHaveProperty('instagramPermalink')
    const existingPostTool = listed.tools.find(t => t.name === 'meta_create_ad_from_instagram_post')
    expect(existingPostTool?.inputSchema?.properties).toHaveProperty('instagramMediaId')
    expect(existingPostTool?.inputSchema?.properties).toHaveProperty('confirmTenantId')

    const resources = await client.listResources()
    const resourceNames = resources.resources.map(r => r.name)
    expect(resourceNames).toContain('meta_create_ad')
    expect(resourceNames).toContain('blimber_tools_catalog')
  })

  it('tools/call resolves meta_create_ad (dryRun path reaches handler validation)', async () => {
    const result = await client.callTool({
      name: 'meta_create_ad',
      arguments: {
        tenantId: '00000000-0000-4000-8000-000000000001',
        adsetId: '123',
        name: 'Test Ad',
        message: 'Copy',
        linkUrl: 'https://example.com',
        dryRun: true,
        confirm: true,
        confirmTenantId: '00000000-0000-4000-8000-000000000001',
      },
    })

    // Handler runs (Supabase/Meta may fail) — must NOT be "Tool … not found".
    const text = JSON.stringify(result)
    expect(text).not.toMatch(/Tool meta_create_ad not found/i)
    expect(text).not.toMatch(/Blimber_Hub\.meta_create_ad not found/i)
    expect(result.isError === true || result.content != null).toBe(true)
  })

  it('tools/call accepts Blimber_Hub.meta_create_ad prefix', async () => {
    const result = await client.callTool({
      name: 'Blimber_Hub.meta_create_ad',
      arguments: {
        tenantId: '00000000-0000-4000-8000-000000000001',
        adsetId: '123',
        name: 'Test Ad',
        message: 'Copy',
        linkUrl: 'https://example.com',
        dryRun: true,
        confirm: true,
        confirmTenantId: '00000000-0000-4000-8000-000000000001',
      },
    })

    const text = JSON.stringify(result)
    expect(text).not.toMatch(/Tool Blimber_Hub\.meta_create_ad not found/i)
    expect(text).not.toMatch(/Tool meta_create_ad not found/i)
  })

  it('tools/call accepts OpenAPI alias createAd', async () => {
    const result = await client.callTool({
      name: 'createAd',
      arguments: {
        tenantId: '00000000-0000-4000-8000-000000000001',
        adsetId: '123',
        name: 'Test Ad',
        message: 'Copy',
        linkUrl: 'https://example.com',
        dryRun: true,
        confirm: true,
        confirmTenantId: '00000000-0000-4000-8000-000000000001',
      },
    })

    const text = JSON.stringify(result)
    expect(text).not.toMatch(/Tool createAd not found/i)
  })
})
