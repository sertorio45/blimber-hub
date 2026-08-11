import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  optionalBool,
  optionalInt,
  optionalString,
} from '../server/utils/meta-gpt-api'
import { resolveMetaGptApiSecret } from '../server/utils/meta-gpt-auth'

const ROOT = join(import.meta.dirname, '..')
const OPENAPI_PATH = join(ROOT, 'gpt/blimber-meta/openapi.yaml')
const SKILL_PATH = join(ROOT, 'gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md')

/** Maps OpenAPI path templates to Nuxt server route files under server/api. */
const EXPECTED_ROUTE_FILES: Record<string, string[]> = {
  '/api/gpt/meta/tools': ['server/api/gpt/meta/tools.get.ts'],
  '/api/gpt/meta/integrations': ['server/api/gpt/meta/integrations.get.ts'],
  '/api/gpt/meta/ad-accounts': ['server/api/gpt/meta/ad-accounts.get.ts'],
  '/api/gpt/meta/campaigns': ['server/api/gpt/meta/campaigns/index.get.ts'],
  '/api/gpt/meta/campaigns/{campaignId}': ['server/api/gpt/meta/campaigns/[campaignId].get.ts'],
  '/api/gpt/meta/campaigns/{campaignId}/status': [
    'server/api/gpt/meta/campaigns/[campaignId]/status.post.ts',
  ],
  '/api/gpt/meta/adsets': ['server/api/gpt/meta/adsets.get.ts'],
  '/api/gpt/meta/ads': ['server/api/gpt/meta/ads.get.ts'],
  '/api/gpt/meta/insights': ['server/api/gpt/meta/insights.post.ts'],
  '/api/gpt/meta/invoke': ['server/api/gpt/meta/invoke.post.ts'],
}

function extractOpenApiPaths(yaml: string): string[] {
  const paths: string[] = []
  for (const line of yaml.split('\n')) {
    const match = line.match(/^ {2}(\/api\/gpt\/meta\/[^\s:]+):/)
    if (match?.[1])
      paths.push(match[1])
  }
  return paths
}

describe('gpt/blimber-meta OpenAPI pack', () => {
  it('OpenAPI exists and declares Bearer auth + consequential mutation', () => {
    expect(existsSync(OPENAPI_PATH)).toBe(true)
    const yaml = readFileSync(OPENAPI_PATH, 'utf8')
    expect(yaml).toContain('openapi: 3.1.0')
    expect(yaml).toContain('BearerAuth:')
    expect(yaml).toContain('scheme: bearer')
    expect(yaml).toContain('x-openai-isConsequential: true')
    expect(yaml).toContain('operationId: updateCampaignStatus')
    expect(yaml).toContain('operationId: getInsights')
  })

  it('every OpenAPI path maps to an existing Nuxt server route file', () => {
    const yaml = readFileSync(OPENAPI_PATH, 'utf8')
    const paths = extractOpenApiPaths(yaml)
    expect(paths.length).toBeGreaterThanOrEqual(Object.keys(EXPECTED_ROUTE_FILES).length)

    for (const path of paths) {
      const files = EXPECTED_ROUTE_FILES[path]
      expect(files, `path não mapeado no teste: ${path}`).toBeDefined()
      for (const relative of files!) {
        expect(existsSync(join(ROOT, relative)), relative).toBe(true)
      }
    }
  })

  it('skill OpenAI tem frontmatter name/description e pasta zipável', () => {
    expect(existsSync(SKILL_PATH)).toBe(true)
    const skill = readFileSync(SKILL_PATH, 'utf8')
    expect(skill.startsWith('---\n')).toBe(true)
    expect(skill).toMatch(/^name:\s*blimber-meta-ads/m)
    expect(skill).toMatch(/^description:/m)
    expect(skill.toLowerCase()).toContain('tenantid')
    expect(existsSync(join(ROOT, 'gpt/blimber-meta/instructions.md'))).toBe(true)
    expect(existsSync(join(ROOT, 'gpt/blimber-meta/gpt-actions.md'))).toBe(true)

    const skillDir = join(ROOT, 'gpt/blimber-meta/skills/blimber-meta-ads')
    const entries = readdirSync(skillDir)
    expect(entries).toContain('SKILL.md')
  })

  it('não inclui ai-plugin.json (plugin clássico deprecated)', () => {
    expect(existsSync(join(ROOT, 'gpt/blimber-meta/ai-plugin.json'))).toBe(false)
  })
})

describe('meta-gpt query helpers', () => {
  it('parses optional string/int/bool', () => {
    expect(optionalString(undefined)).toBeUndefined()
    expect(optionalString('abc')).toBe('abc')
    expect(optionalInt('42')).toBe(42)
    expect(optionalInt('x')).toBeUndefined()
    expect(optionalBool('true')).toBe(true)
    expect(optionalBool('não')).toBe(false)
    expect(optionalBool('maybe')).toBeUndefined()
  })

  it('resolveMetaGptApiSecret reads BLIMBER_MCP_API_KEY', () => {
    const prev = process.env.BLIMBER_MCP_API_KEY
    const prevWorker = process.env.MARKETING_WORKER_SECRET
    process.env.BLIMBER_MCP_API_KEY = 'test-key-gpt'
    delete process.env.MARKETING_WORKER_SECRET
    expect(resolveMetaGptApiSecret()).toBe('test-key-gpt')
    process.env.BLIMBER_MCP_API_KEY = prev
    process.env.MARKETING_WORKER_SECRET = prevWorker
  })
})
