import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  optionalBool,
  optionalInt,
  optionalString,
} from '../server/utils/meta-gpt-api'
import { resolveMetaGptApiSecret } from '../server/utils/meta-gpt-auth'
import {
  buildTenantNameSearchPattern,
  clampTenantSearchLimit,
  escapeIlikePattern,
  normalizeTenantSearchQuery,
} from '../server/utils/meta-gpt-tenants'

const ROOT = join(import.meta.dirname, '..')
const OPENAPI_PATH = join(ROOT, 'gpt/blimber/openapi-ads.yaml')
const SKILL_PATH = join(ROOT, '.agents/skills/blimber-meta-ads/SKILL.md')
const INSTRUCTIONS_PATH = join(ROOT, 'gpt/blimber/instructions.md')
const ACTIONS_DOC_PATH = join(ROOT, 'docs/gpt-blimber-ACTIONS.md')

/** Maps OpenAPI Ads path templates to Nuxt server route files under server/api. */
const EXPECTED_ROUTE_FILES: Record<string, string[]> = {
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

function extractOpenApiPaths(yaml: string): string[] {
  const paths: string[] = []
  for (const line of yaml.split('\n')) {
    const match = line.match(/^ {2}(\/api\/gpt\/meta\/[^\s:]+):/)
    if (match?.[1])
      paths.push(match[1])
  }
  return paths
}

/** Approximate OpenAPI description lengths (plain + folded `>` / `|`) for ChatGPT import limits. */
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
        const lineIndent = (line.match(/^(\s*)/)?.[1] ?? '').length
        if (lineIndent <= indent)
          break
        parts.push(line.slice(indent + 2))
        j++
      }
      content = (folded ? parts.join(' ') : parts.join('\n')).replace(/[ \t]+/g, ' ').trim()
    }
    else if (
      (content.startsWith('"') && content.endsWith('"'))
      || (content.startsWith("'") && content.endsWith("'"))
    ) {
      content = content.slice(1, -1)
    }
    if (content.length > 300)
      out.push({ length: content.length, preview: content.slice(0, 80) })
  }
  return out
}

describe('gpt/blimber Ads OpenAPI (openapi-ads.yaml)', () => {
  it('OpenAPI YAML is ChatGPT-Actions friendly (parse shape + description limits)', () => {
    const yaml = readFileSync(OPENAPI_PATH, 'utf8')
    // Regression: contact.name fused with servers key → invalid YAML ("Hubservers:")
    expect(yaml).not.toContain('Hubservers')
    expect(yaml).toMatch(/^ {4}name: Blimber Hub\s*$/m)
    expect(yaml).toMatch(/^servers:\s*$/m)
    expect(yaml.match(/^servers:\s*$/gm)?.length ?? 0).toBe(1)
    expect(yaml).toMatch(/^openapi: ['"]?3\.(0\.3|1\.1)['"]?\s*$/m)
    expect(yaml).not.toContain('additionalProperties:')
    expect(yaml).not.toMatch(/^\s+(oneOf|anyOf|allOf|nullable):/m)
    expect(yaml).not.toMatch(/parameters:\s*\n\s*-\s*\$ref:/)

    const longDescriptions = extractDescriptionLengths(yaml)
    expect(
      longDescriptions,
      `descriptions >300 chars (ChatGPT import): ${JSON.stringify(longDescriptions)}`,
    ).toEqual([])

    const operationIds = [...yaml.matchAll(/^\s+operationId:\s*(\S+)\s*$/gm)].map(m => m[1]!)
    expect(operationIds.length).toBeGreaterThanOrEqual(20)
    expect(new Set(operationIds).size).toBe(operationIds.length)

    const paths = extractOpenApiPaths(yaml)
    expect(paths.length).toBeGreaterThanOrEqual(Object.keys(EXPECTED_ROUTE_FILES).length)
    for (const path of paths) {
      // Each path template must declare at least one HTTP operation with operationId nearby
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const block = yaml.match(new RegExp(`^ {2}${escaped}:\\n([\\s\\S]*?)(?=^ {2}/|\\ncomponents:)`, 'm'))
      expect(block?.[1], `bloco do path ${path}`).toBeTruthy()
      expect(block![1]).toMatch(/operationId:\s*\S+/)
    }
  })

  it('OpenAPI exists and declares Bearer auth + consequential mutation', () => {
    expect(existsSync(OPENAPI_PATH)).toBe(true)
    const yaml = readFileSync(OPENAPI_PATH, 'utf8')
    expect(yaml).toMatch(/^openapi: ['"]?3\.(0\.3|1\.1)['"]?\s*$/m)
    expect(yaml).toContain('servers:')
    expect(yaml).toContain('https://ads.blimber.com.br')
    expect(yaml).not.toContain('https://app.blimber.com.br')
    expect(yaml).not.toContain('YOUR_PUBLIC_HTTPS_HOST')
    expect(yaml).not.toMatch(/parameters:\s*\n\s*-\s*\$ref:/)
    expect(yaml).toContain('BearerAuth:')
    expect(yaml).toContain('scheme: bearer')
    expect(yaml).toContain('x-openai-isConsequential: true')
    expect(yaml).toContain('operationId: updateCampaignStatus')
    expect(yaml).toContain('operationId: createCampaign')
    expect(yaml).toContain('operationId: createAdset')
    expect(yaml).toContain('operationId: createAd')
    expect(yaml).toContain('operationId: updateAdsetBudget')
    expect(yaml).toContain('operationId: updateAdsetTargeting')
    expect(yaml).toContain('operationId: updateAdCreativeCopy')
    expect(yaml).toContain('operationId: updateAdMedia')
    expect(yaml).toContain('operationId: previewBulkDelete')
    expect(yaml).toContain('operationId: executeBulkDelete')
    expect(yaml).toContain('operationId: updateAdsetStatus')
    expect(yaml).toContain('operationId: updateAdStatus')
    expect(yaml).toContain('operationId: getInsights')
    expect(yaml).not.toContain('operationId: searchTenants')
    expect(yaml).not.toContain('/api/gpt/meta/tenants')
    expect(yaml).toContain('/api/gpt/meta/bulk-delete/preview')
    expect(yaml).toContain('meta_update_adset_status')
    expect(yaml).toContain('meta_update_ad_status')
    expect(yaml).toContain('meta_create_campaign')
    expect(yaml).toContain('meta_create_adset')
    expect(yaml).toContain('meta_create_ad')
    expect(yaml).toContain('meta_update_adset_budget')
    expect(yaml).toContain('meta_update_adset_targeting')
    expect(yaml).toContain('meta_update_ad_creative_copy')
    expect(yaml).toContain('meta_update_ad_media')
    expect(yaml).toContain('meta_preview_bulk_delete')
    expect(yaml).toContain('meta_execute_bulk_delete')
    expect(yaml).toContain('CreateCampaignBody')
    expect(yaml).toContain('CreateAdsetBody')
    expect(yaml).toContain('CreateAdBody')
    expect(yaml).toContain('UpdateAdsetBudgetBody')
    expect(yaml).toContain('UpdateAdCreativeCopyBody')
    expect(yaml).toContain('PreviewBulkDeleteBody')
    expect(yaml).toContain('ExecuteBulkDeleteBody')
    expect(yaml).toContain('confirmDelete')
    expect(yaml).toContain('previewToken')
    expect(yaml).toContain('targetingTemplate')
    expect(yaml).toContain('BR_18_65')
    expect(yaml).toContain('linkUrl')
    expect(yaml).toContain('destinationType')
    expect(yaml).toContain('WHATSAPP')
    expect(yaml).toContain('welcomeMessage')
    expect(yaml).toContain('confirmBudgetIncrease')
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
    expect(skill).toContain('searchTenants')
    expect(skill).toContain('updateAdsetStatus')
    expect(skill).toContain('createCampaign')
    expect(skill).toContain('createAdset')
    expect(skill).toContain('createAd')
    expect(skill).toContain('updateAdsetBudget')
    expect(skill).toContain('updateAdCreativeCopy')
    expect(skill).toContain('previewBulkDelete')
    expect(skill).toContain('executeBulkDelete')
    expect(skill).toContain('mostrar → confirmar → mutar')
    expect(skill).toContain('BR_18_65')
    expect(skill.toLowerCase()).toContain('nunca invent')
    expect(skill.toLowerCase()).toContain('nunca')
    expect(skill).toContain('previewToken')
    expect(existsSync(INSTRUCTIONS_PATH)).toBe(true)
    expect(existsSync(ACTIONS_DOC_PATH)).toBe(true)
    const skillDir = join(ROOT, '.agents/skills/blimber-meta-ads')
    const entries = readdirSync(skillDir)
    expect(entries).toContain('SKILL.md')
    expect(existsSync(join(ROOT, 'gpt/blimber-meta'))).toBe(false)
  })

  it('não inclui ai-plugin.json (plugin clássico deprecated)', () => {
    expect(existsSync(join(ROOT, 'gpt/blimber/ai-plugin.json'))).toBe(false)
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

describe('meta-gpt tenant search helpers', () => {
  it('escapes ILIKE wildcards and builds partial pattern', () => {
    expect(escapeIlikePattern('a%b_c')).toBe('a\\%b\\_c')
    expect(buildTenantNameSearchPattern('  Farma  Estetica ')).toBe('%Farma Estetica%')
    expect(buildTenantNameSearchPattern('100%_off')).toBe('%100\\%\\_off%')
  })

  it('normalizes query and clamps limit', () => {
    expect(normalizeTenantSearchQuery('a')).toBeNull()
    expect(normalizeTenantSearchQuery('  ab  ')).toBe('ab')
    expect(clampTenantSearchLimit(undefined)).toBe(20)
    expect(clampTenantSearchLimit(999)).toBe(50)
    expect(clampTenantSearchLimit(0)).toBe(1)
  })
})
