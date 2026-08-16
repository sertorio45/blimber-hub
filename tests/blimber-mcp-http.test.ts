import { describe, expect, it } from 'vitest'
import { META_TOOL_DESCRIPTIONS } from '../lib/meta-ads'
import {
  buildBlimberMcpRegistry,
  MARKETING_TOOL_DESCRIPTIONS,
} from '../lib/blimber-mcp'
import { listBlimberMcpRemoteToolNames } from '../lib/blimber-mcp/create-server'

describe('blimber MCP remote server tools', () => {
  it('lists platform, marketing, meta and google stub tools', () => {
    const names = listBlimberMcpRemoteToolNames()

    expect(names).toContain('searchTenants')
    expect(names).toContain('listBlimberTools')
    expect(names).toContain('marketing_list_posts')
    expect(names).toContain('marketing_delete_asset')
    expect(names).toContain('marketing_upload_asset')
    expect(names).toContain('meta_list_campaigns')
    expect(names).toContain('meta_create_campaign')
    expect(names).toContain('ads_google_status')

    const marketingCount = names.filter(n => n.startsWith('marketing_')).length
    const metaCount = names.filter(n => n.startsWith('meta_')).length

    expect(marketingCount).toBe(Object.keys(MARKETING_TOOL_DESCRIPTIONS).length)
    expect(metaCount).toBe(Object.keys(META_TOOL_DESCRIPTIONS).length)
    expect(names.length).toBe(2 + marketingCount + metaCount + 1)
    expect(new Set(names).size).toBe(names.length)
  })

  it('remote MCP tools are a subset of the unified registry (no alias duplication)', () => {
    const registry = buildBlimberMcpRegistry()
    const registryReadyNames = new Set(
      registry.tools
        .filter(tool => tool.status === 'ready' || tool.status === 'stub')
        .map(tool => tool.name),
    )

    for (const name of listBlimberMcpRemoteToolNames()) {
      expect(registryReadyNames.has(name), `missing in registry: ${name}`).toBe(true)
    }

    const aliasOnly = registry.tools.filter(tool => tool.status === 'alias')
    for (const alias of aliasOnly) {
      expect(listBlimberMcpRemoteToolNames()).not.toContain(alias.name)
    }
  })

  it('documents the Streamable HTTP endpoint path', () => {
    expect('/api/mcp').toMatch(/^\/api\/mcp$/)
  })
})
