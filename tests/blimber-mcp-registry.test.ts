import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildBlimberMcpRegistry,
  MARKETING_TOOL_DESCRIPTIONS,
  toAdsMetaToolName,
  fromAdsMetaToolName,
} from '../lib/blimber-mcp'

const ROOT = join(import.meta.dirname, '..')
const OPENAPI_PATH = join(ROOT, 'gpt/blimber/openapi.yaml')

function extractOpenApiPaths(yaml: string): string[] {
  const paths: string[] = []
  for (const line of yaml.split('\n')) {
    const match = line.match(/^ {2}(\/api\/gpt\/[^\s:]+):/)
    if (match?.[1])
      paths.push(match[1])
  }
  return paths
}

function extractDescriptionLengths(yamlText: string): Array<{ length: number, preview: string }> {
  const lines = yamlText.split('\n')
  const out: Array<{ length: number, preview: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(\s*)description:\s*(.*)$/)
    if (!match)
      continue
    const indent = match[1]!.length
    let content = match[2]!
    if (content === '>' || content === '|' || content === '>-' || content === '|-') {
      const folded = content.startsWith('>')
      const parts: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const line = lines[j]!
        if (line.length === 0) {
          parts.push('')
          j++
          continue
        }
        const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0
        if (lineIndent <= indent)
          break
        parts.push(line.slice(indent + 2).trimEnd())
        j++
      }
      content = folded ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n')
    }
    out.push({ length: content.length, preview: content.slice(0, 80) })
  }
  return out
}

const EXPECTED_ROUTE_FILES: Record<string, string[]> = {
  '/api/gpt/tenants': ['server/api/gpt/tenants.get.ts'],
  '/api/gpt/tools': ['server/api/gpt/tools.get.ts'],
  '/api/gpt/marketing/tools': ['server/api/gpt/marketing/tools.get.ts'],
  '/api/gpt/marketing/accounts': ['server/api/gpt/marketing/accounts.get.ts'],
  '/api/gpt/marketing/assets': ['server/api/gpt/marketing/assets.get.ts'],
  '/api/gpt/marketing/brand-context': ['server/api/gpt/marketing/brand-context.get.ts'],
  '/api/gpt/brand/context': ['server/api/gpt/brand/context.get.ts'],
  '/api/gpt/marketing/posts': [
    'server/api/gpt/marketing/posts/index.get.ts',
    'server/api/gpt/marketing/posts/index.post.ts',
  ],
  '/api/gpt/marketing/posts/{postId}': [
    'server/api/gpt/marketing/posts/[postId].get.ts',
    'server/api/gpt/marketing/posts/[postId].put.ts',
  ],
  '/api/gpt/marketing/campaigns': [
    'server/api/gpt/marketing/campaigns/index.get.ts',
    'server/api/gpt/marketing/campaigns/index.post.ts',
  ],
  '/api/gpt/marketing/campaigns/{campaignId}': [
    'server/api/gpt/marketing/campaigns/[campaignId].get.ts',
    'server/api/gpt/marketing/campaigns/[campaignId].put.ts',
  ],
  '/api/gpt/ads/meta/tools': ['server/api/gpt/ads/meta/tools.get.ts'],
  '/api/gpt/ads/google/status': ['server/api/gpt/ads/google/status.get.ts'],
  '/api/gpt/meta/tenants': ['server/api/gpt/meta/tenants.get.ts'],
}

describe('blimber unified MCP registry + openapi', () => {
  it('registry exposes platform, marketing, ads.meta and stubs', () => {
    const registry = buildBlimberMcpRegistry()
    expect(registry.server).toBe('blimber')
    expect(registry.domains).toContain('marketing')
    expect(registry.domains).toContain('ads.meta')
    expect(registry.domains).toContain('ads.google')
    expect(registry.domains).toContain('crm')

    const names = registry.tools.map(t => t.name)
    expect(names).toContain('searchTenants')
    expect(names).toContain('marketing_list_posts')
    expect(names).toContain('marketing_create_campaign')
    expect(names).toContain('meta_list_campaigns')
    expect(names).toContain('ads_meta_list_campaigns')
    expect(names).toContain('ads_google_status')
    expect(names).toContain('crm_status')
  })

  it('maps ads_meta_* aliases to meta_* tools', () => {
    expect(toAdsMetaToolName('meta_list_campaigns')).toBe('ads_meta_list_campaigns')
    expect(fromAdsMetaToolName('ads_meta_list_campaigns')).toBe('meta_list_campaigns')
    expect(fromAdsMetaToolName('meta_get_insights')).toBe('meta_get_insights')
    expect(fromAdsMetaToolName('unknown_tool')).toBeNull()
  })

  it('marketing tool descriptions stay non-empty', () => {
    for (const [name, description] of Object.entries(MARKETING_TOOL_DESCRIPTIONS)) {
      expect(description.length, name).toBeGreaterThan(20)
    }
  })

  it('unified openapi exists with expected paths and short descriptions', () => {
    expect(existsSync(OPENAPI_PATH)).toBe(true)
    const yaml = readFileSync(OPENAPI_PATH, 'utf8')
    expect(yaml).toContain('openapi: 3.0.3')
    expect(yaml).toContain('https://app.blimber.com.br')
    expect(yaml).toContain('BearerAuth')
    expect(yaml).not.toMatch(/parameters:\s*\n\s*-\s*\$ref:/)
    expect(yaml).not.toMatch(/^\s+nullable:/m)
    expect(yaml).not.toMatch(/^\s+(oneOf|anyOf|allOf):/m)

    const paths = extractOpenApiPaths(yaml)
    for (const path of Object.keys(EXPECTED_ROUTE_FILES))
      expect(paths, path).toContain(path)

    for (const [path, files] of Object.entries(EXPECTED_ROUTE_FILES)) {
      for (const file of files)
        expect(existsSync(join(ROOT, file)), `${path} → ${file}`).toBe(true)
    }

    const lengths = extractDescriptionLengths(yaml)
    for (const item of lengths) {
      expect(item.length, item.preview).toBeLessThanOrEqual(300)
    }

    const operationIds = [...yaml.matchAll(/^\s+operationId:\s*(\S+)\s*$/gm)].map(m => m[1]!)
    expect(new Set(operationIds).size).toBe(operationIds.length)
    expect(operationIds).toContain('createPost')
    expect(operationIds).toContain('createEditorialCampaign')
    expect(operationIds).toContain('listAdsMetaTools')
  })

  it('keeps Meta pack openapi intact on disk', () => {
    expect(existsSync(join(ROOT, 'gpt/blimber-meta/openapi.yaml'))).toBe(true)
    expect(existsSync(join(ROOT, 'server/api/gpt/meta/campaigns/index.get.ts'))).toBe(true)
  })
})
