import { execFileSync } from 'node:child_process'
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
const OPENAPI_INDEX_PATH = join(ROOT, 'gpt/blimber/openapi.yaml')
const OPENAPI_MARKETING_PATH = join(ROOT, 'gpt/blimber/openapi-marketing.yaml')
const OPENAPI_ADS_PATH = join(ROOT, 'gpt/blimber/openapi-ads.yaml')
const CHATGPT_MAX_OPERATIONS = 30
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

function extractOperationIds(yaml: string): string[] {
  return [...yaml.matchAll(/^\s+operationId:\s*(\S+)\s*$/gm)].map(m => m[1]!)
}

function extractServerUrls(yaml: string): string[] {
  return [...yaml.matchAll(/^\s+-\s+url:\s+(\S+)\s*$/gm)].map(m => m[1]!)
}

function parseYaml(text: string): Record<string, unknown> {
  try {
    const out = execFileSync(
      'python3',
      ['-c', 'import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read()), ensure_ascii=False))'],
      { input: text, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    )
    return JSON.parse(out) as Record<string, unknown>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`YAML parse failed (python3 + PyYAML required): ${message}`)
  }
}

function countParsedOperations(doc: Record<string, unknown>): string[] {
  const ids: string[] = []
  const paths = doc.paths as Record<string, Record<string, { operationId?: string }>> | undefined
  if (!paths)
    return ids
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object')
      continue
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object')
        continue
      ids.push(operation.operationId ?? `${method.toUpperCase()} ${path}`)
    }
  }
  return ids
}

function collectLongDescriptions(
  value: unknown,
  path = '$',
): Array<{ path: string, length: number, preview: string }> {
  const out: Array<{ path: string, length: number, preview: string }> = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      out.push(...collectLongDescriptions(item, `${path}[${index}]`))
    })
    return out
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const next = `${path}.${key}`
      if (key === 'description' && typeof nested === 'string' && nested.length > 300) {
        out.push({ path: next, length: nested.length, preview: nested.slice(0, 80) })
        continue
      }
      out.push(...collectLongDescriptions(nested, next))
    }
  }
  return out
}

function assertChatGptActionSpec(yaml: string, expectedHost: string) {
  expect(yaml).not.toContain('Hubservers')
  expect(yaml).toMatch(/^ {4}name: Blimber Hub\s*$/m)
  expect(yaml).toMatch(/^servers:\s*$/m)
  expect(yaml.match(/^servers:\s*$/gm)?.length ?? 0).toBe(1)
  expect(yaml).toMatch(/^openapi: ['"]?3\.(0\.3|1\.1)['"]?\s*$/m)
  expect(yaml).toContain(expectedHost)
  expect(yaml).not.toContain('YOUR_PUBLIC_HTTPS_HOST')
  expect(yaml).toContain('BearerAuth')
  expect(yaml).not.toContain('additionalProperties:')
  expect(yaml).not.toMatch(/parameters:\s*\n\s*-\s*\$ref:/)
  expect(yaml).not.toMatch(/^\s+nullable:/m)
  expect(yaml).not.toMatch(/^\s+(oneOf|anyOf|allOf):/m)

  const doc = parseYaml(yaml)
  expect(['3.0.3', '3.1.1']).toContain(doc.openapi)
  const servers = (doc.servers as Array<{ url: string }> | undefined)?.map(server => server.url) ?? []
  expect(servers).toEqual([expectedHost])
  expect(extractServerUrls(yaml)).toEqual([expectedHost])

  const longDescriptions = [
    ...extractDescriptionLengths(yaml).filter(item => item.length > 300),
    ...collectLongDescriptions(doc),
  ]
  expect(
    longDescriptions,
    `descriptions >300 chars (ChatGPT import): ${JSON.stringify(longDescriptions)}`,
  ).toEqual([])

  const operationIds = extractOperationIds(yaml)
  const parsedIds = countParsedOperations(doc)
  expect(parsedIds).toEqual(operationIds)
  expect(operationIds.length).toBeGreaterThan(0)
  expect(
    operationIds.length,
    `ChatGPT max ${CHATGPT_MAX_OPERATIONS} operations, got ${operationIds.length}`,
  ).toBeLessThanOrEqual(CHATGPT_MAX_OPERATIONS)
  expect(new Set(operationIds).size).toBe(operationIds.length)
}

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
  '/api/gpt/meta/tools': ['server/api/gpt/meta/tools.get.ts'],
  '/api/gpt/meta/integrations': ['server/api/gpt/meta/integrations.get.ts'],
  '/api/gpt/meta/ad-accounts': ['server/api/gpt/meta/ad-accounts.get.ts'],
  '/api/gpt/meta/campaigns': [
    'server/api/gpt/meta/campaigns/index.get.ts',
    'server/api/gpt/meta/campaigns/index.post.ts',
  ],
  '/api/gpt/meta/campaigns/{campaignId}': ['server/api/gpt/meta/campaigns/[campaignId].get.ts'],
  '/api/gpt/meta/campaigns/{campaignId}/status': [
    'server/api/gpt/meta/campaigns/[campaignId]/status.post.ts',
  ],
  '/api/gpt/meta/adsets': [
    'server/api/gpt/meta/adsets.get.ts',
    'server/api/gpt/meta/adsets.post.ts',
  ],
  '/api/gpt/meta/adsets/{adsetId}/status': [
    'server/api/gpt/meta/adsets/[adsetId]/status.post.ts',
  ],
  '/api/gpt/meta/adsets/{adsetId}/budget': [
    'server/api/gpt/meta/adsets/[adsetId]/budget.post.ts',
  ],
  '/api/gpt/meta/adsets/{adsetId}/targeting': [
    'server/api/gpt/meta/adsets/[adsetId]/targeting.post.ts',
  ],
  '/api/gpt/meta/ads': [
    'server/api/gpt/meta/ads.get.ts',
    'server/api/gpt/meta/ads.post.ts',
  ],
  '/api/gpt/meta/ads/{adId}/status': [
    'server/api/gpt/meta/ads/[adId]/status.post.ts',
  ],
  '/api/gpt/meta/ads/{adId}/creative-copy': [
    'server/api/gpt/meta/ads/[adId]/creative-copy.post.ts',
  ],
  '/api/gpt/meta/ads/{adId}/media': [
    'server/api/gpt/meta/ads/[adId]/media.post.ts',
  ],
  '/api/gpt/meta/bulk-delete/preview': [
    'server/api/gpt/meta/bulk-delete/preview.post.ts',
  ],
  '/api/gpt/meta/bulk-delete/execute': [
    'server/api/gpt/meta/bulk-delete/execute.post.ts',
  ],
  '/api/gpt/meta/insights': ['server/api/gpt/meta/insights.post.ts'],
  '/api/gpt/meta/invoke': ['server/api/gpt/meta/invoke.post.ts'],
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

  it('openapi.yaml is an index pointer, not an importable ChatGPT Action', () => {
    expect(existsSync(OPENAPI_INDEX_PATH)).toBe(true)
    const index = readFileSync(OPENAPI_INDEX_PATH, 'utf8')
    expect(index).toMatch(/NÃO IMPORTE|NÃO importe/)
    expect(index).toContain('openapi-marketing.yaml')
    expect(index).toContain('openapi-ads.yaml')
    expect(index).not.toMatch(/^\s+operationId:/m)
    expect(extractServerUrls(index)).toEqual([])

    const doc = parseYaml(index)
    expect(doc.openapi).toBe('3.0.3')
    expect(doc.servers ?? []).toEqual([])
    expect(countParsedOperations(doc)).toEqual([])
  })

  it('marketing Action spec is ChatGPT-friendly (≤30 ops, app host)', () => {
    expect(existsSync(OPENAPI_MARKETING_PATH)).toBe(true)
    const yaml = readFileSync(OPENAPI_MARKETING_PATH, 'utf8')
    assertChatGptActionSpec(yaml, 'https://app.blimber.com.br')

    const operationIds = extractOperationIds(yaml)
    expect(operationIds).toContain('searchTenants')
    expect(operationIds).toContain('listBlimberTools')
    expect(operationIds).toContain('listSocialAccounts')
    expect(operationIds).toContain('listMediaAssets')
    expect(operationIds).toContain('getBrandContext')
    expect(operationIds).toContain('createPost')
    expect(operationIds).toContain('createEditorialCampaign')
    expect(operationIds).not.toContain('listCampaigns')
    expect(operationIds).not.toContain('createCampaign')
    expect(operationIds).not.toContain('searchTenantsMetaCompat')

    const paths = extractOpenApiPaths(yaml)
    expect(paths).toContain('/api/gpt/tenants')
    expect(paths).toContain('/api/gpt/tools')
    expect(paths).toContain('/api/gpt/marketing/accounts')
    expect(paths).toContain('/api/gpt/marketing/assets')
    expect(paths).toContain('/api/gpt/marketing/brand-context')
    expect(paths).toContain('/api/gpt/marketing/posts')
    expect(paths).toContain('/api/gpt/marketing/campaigns')
    expect(paths.some(p => p.startsWith('/api/gpt/meta/'))).toBe(false)
  })

  it('ads Action spec is ChatGPT-friendly (≤30 ops, ads host, no tenant duplicate)', () => {
    expect(existsSync(OPENAPI_ADS_PATH)).toBe(true)
    const yaml = readFileSync(OPENAPI_ADS_PATH, 'utf8')
    assertChatGptActionSpec(yaml, 'https://ads.blimber.com.br')
    expect(yaml).not.toContain('https://app.blimber.com.br')

    const operationIds = extractOperationIds(yaml)
    expect(operationIds).not.toContain('searchTenants')
    for (const id of [
      'listIntegrations',
      'listAdAccounts',
      'listCampaigns',
      'createCampaign',
      'getCampaign',
      'updateCampaignStatus',
      'listAdsets',
      'createAdset',
      'updateAdsetStatus',
      'updateAdsetBudget',
      'updateAdsetTargeting',
      'listAds',
      'createAd',
      'updateAdStatus',
      'updateAdCreativeCopy',
      'updateAdMedia',
      'previewBulkDelete',
      'executeBulkDelete',
      'getInsights',
    ]) {
      expect(operationIds, id).toContain(id)
    }
    expect(yaml).toContain('x-openai-isConsequential: true')
    expect(yaml).toContain('CreateCampaignBody')
    expect(yaml).toContain('destinationType')
    expect(yaml).toContain('WHATSAPP')

    const paths = extractOpenApiPaths(yaml)
    expect(paths).toContain('/api/gpt/meta/integrations')
    expect(paths).toContain('/api/gpt/meta/campaigns')
    expect(paths).not.toContain('/api/gpt/meta/tenants')
    expect(paths).not.toContain('/api/gpt/tenants')
    expect(paths.some(p => p.startsWith('/api/gpt/marketing/'))).toBe(false)
  })

  it('marketing and ads Actions use different hosts', () => {
    const marketing = readFileSync(OPENAPI_MARKETING_PATH, 'utf8')
    const ads = readFileSync(OPENAPI_ADS_PATH, 'utf8')
    const marketingHosts = extractServerUrls(marketing)
    const adsHosts = extractServerUrls(ads)
    expect(marketingHosts).toHaveLength(1)
    expect(adsHosts).toHaveLength(1)
    expect(marketingHosts[0]).not.toBe(adsHosts[0])
    expect(marketingHosts[0]).toBe('https://app.blimber.com.br')
    expect(adsHosts[0]).toBe('https://ads.blimber.com.br')
  })

  it('backend keeps full route set regardless of Action split', () => {
    for (const [path, files] of Object.entries(EXPECTED_ROUTE_FILES)) {
      for (const file of files)
        expect(existsSync(join(ROOT, file)), `${path} → ${file}`).toBe(true)
    }
  })

  it('Ads OpenAPI is canonical; standalone gpt/blimber-meta pack is gone', () => {
    expect(existsSync(join(ROOT, 'gpt/blimber-meta'))).toBe(false)
    expect(existsSync(join(ROOT, 'gpt/blimber-meta/openapi.yaml'))).toBe(false)
    expect(existsSync(OPENAPI_ADS_PATH)).toBe(true)
    expect(existsSync(join(ROOT, 'server/api/gpt/meta/campaigns/index.get.ts'))).toBe(true)
    const ads = readFileSync(OPENAPI_ADS_PATH, 'utf8')
    expect(ads).toContain('https://ads.blimber.com.br')
    expect(ads).not.toContain('https://app.blimber.com.br')
    expect(ads).not.toContain('operationId: searchTenants')
    expect(ads).toContain('/api/gpt/meta/campaigns')
    expect(ads).toContain('operationId: previewBulkDelete')
    expect(ads).toContain('operationId: executeBulkDelete')
    expect(ads).toContain('operationId: invokeMetaTool')
    expect(ads).toContain('operationId: updateAdsetBudget')
    expect(ads).toContain('operationId: listAdAccounts')

    const index = readFileSync(OPENAPI_INDEX_PATH, 'utf8')
    expect(index).toMatch(/NÃO IMPORTE|NÃO importe/)
    expect(index).toContain('openapi-ads.yaml')
    expect(index).not.toContain('gpt/blimber-meta')
  })
})
