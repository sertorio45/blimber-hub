import type { CmsBlock } from '~/lib/cms/contracts'

import { describe, expect, it } from 'vitest'

import {
  createBlock,
  duplicateSection,
  listBlockDefinitions,
  moveBlock,
  renderBlocks,
  validatePageBlocks,
} from '~/lib/cms/blocks'
import { CMS_LIMITS } from '~/lib/cms/contracts'

const BLOCK_IDS = [
  'section',
  'hero',
  'richText',
  'imageText',
  'cards',
  'faq',
  'cta',
  'gallery',
  'testimonials',
  'latestPublications',
]

function sectionChain(depth: number): CmsBlock {
  const block = createBlock('section')
  if (depth > 1)
    block.children = [sectionChain(depth - 1)]
  return block
}

describe('cms block registry', () => {
  it('registers the ten initial blocks with schema, defaults and depth ceiling', () => {
    const definitions = listBlockDefinitions()
    expect(definitions.map(item => item.id)).toEqual(BLOCK_IDS)
    for (const definition of definitions) {
      expect(definition.version).toBe(1)
      expect(definition.label.trim().length).toBeGreaterThan(0)
      expect(definition.maxDepth).toBe(CMS_LIMITS.maxBlockDepth)
      expect(definition.propsSchema.parse({})).toEqual(definition.defaults)
      expect(definition.fields.length).toBeGreaterThan(0)
    }
    expect(definitions.filter(item => item.acceptsChildren).map(item => item.id)).toEqual(['section'])
  })
})

describe('validatePageBlocks', () => {
  it('accepts every default block and a section nested up to the limit', () => {
    const blocks = listBlockDefinitions().map(definition => createBlock(definition.id))
    const nested = sectionChain(CMS_LIMITS.maxBlockDepth)
    expect(validatePageBlocks([...blocks, nested])).toEqual([])
  })

  it('rejects a tree one level past the depth limit', () => {
    const issues = validatePageBlocks([sectionChain(CMS_LIMITS.maxBlockDepth + 1)])
    expect(issues.some(issue => issue.code === 'max_depth')).toBe(true)
  })

  it('rejects an unknown block type', () => {
    const issues = validatePageBlocks([{ id: 'x', type: 'grapes', version: 1, props: {} }])
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'unknown_block',
        message: 'Tipo de bloco desconhecido: grapes.',
      }),
    ])
  })

  it('rejects children on a leaf and a wrong prop type', () => {
    const hero = createBlock('hero')
    hero.children = [createBlock('richText')]
    expect(validatePageBlocks([hero]).some(issue => issue.code === 'children_not_allowed')).toBe(true)

    const invalid = createBlock('hero')
    invalid.props = { ...invalid.props, title: 12 as unknown as string }
    expect(validatePageBlocks([invalid]).some(issue => issue.code === 'invalid_props')).toBe(true)
  })

  it('rejects an unsupported block version', () => {
    const hero = createBlock('hero')
    hero.version = 9
    expect(validatePageBlocks([hero]).some(issue => issue.code === 'invalid_version')).toBe(true)
  })
})

describe('block tree and public render', () => {
  it('duplicates a section with fresh ids and refuses to duplicate a leaf', () => {
    const section = createBlock('section')
    const hero = createBlock('hero')
    section.children = [hero]
    const next = duplicateSection([section], section.id)
    expect(next).toHaveLength(2)
    expect(next[1]?.id).not.toBe(section.id)
    expect(next[1]?.children?.[0]?.id).not.toBe(hero.id)
    expect(next[1]?.children?.[0]?.type).toBe('hero')
    expect(duplicateSection([hero], hero.id)).toEqual([hero])
  })

  it('reorders siblings without changing their props', () => {
    const first = createBlock('hero')
    const second = createBlock('cta')
    first.props = { ...first.props, title: 'Primeiro' }
    const next = moveBlock([first, second], first.id, 1)
    expect(next.map(block => block.id)).toEqual([second.id, first.id])
    expect(next[1]?.props).toMatchObject({ title: 'Primeiro' })
  })

  it('escapes text interpolated into public html', () => {
    const hero = createBlock('hero')
    hero.props = { ...hero.props, title: 'Olá <script>' }
    const html = renderBlocks([hero])
    expect(html).toContain('data-block="hero"')
    expect(html).toContain('Olá &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('drops script tags from rich text before rendering', () => {
    const block = createBlock('richText')
    block.props = { ...block.props, html: '<p>Oi</p><script>alert(1)</script>' }
    const html = renderBlocks([block])
    expect(html).toContain('<p>Oi</p>')
    expect(html).not.toContain('script')
    expect(html).not.toContain('alert(1)')
  })
})
